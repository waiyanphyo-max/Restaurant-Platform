package com.restaurant.platform.config;

import com.restaurant.platform.common.error.ApiSecurityErrorHandler;
import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.common.error.GlobalExceptionHandler;
import com.restaurant.platform.controller.PlatformAdminDashboardController;
import com.restaurant.platform.controller.PlatformRestaurantProvisioningController;
import com.restaurant.platform.security.PlatformAdminAuthorization;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.service.PlatformAdminDashboardService;
import com.restaurant.platform.service.PlatformRestaurantProvisioningService;
import com.restaurant.platform.service.RestaurantManagementService;
import com.restaurant.platform.service.SupabaseAuthAdminClient;
import com.restaurant.platform.service.SupabaseAuthAdminException;
import com.restaurant.platform.dto.restaurant.RestaurantResponse;
import com.restaurant.platform.dto.restaurant.RestaurantOnboardingResponse;
import com.restaurant.platform.repository.ProfileRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.env.Environment;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;
import java.time.OffsetDateTime;

import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.any;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

/** HTTP-level checks for every platform route using the real JWT subject and admin allowlist guards. */
@WebMvcTest(
        controllers = {
                PlatformAdminDashboardController.class,
                PlatformRestaurantProvisioningController.class
        },
        properties = {
                "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://auth.example.test/auth/v1",
                "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=https://auth.example.test/auth/v1/.well-known/jwks.json",
                "app.security.jwt.required-audience=authenticated",
                "app.security.jwt.signing-algorithm=ES256",
                "app.security.platform-admin-user-ids=00000000-0000-0000-0000-000000000001",
                "app.cors.allowed-origins=http://localhost:3000"
        })
@Import({
        SecurityConfig.class,
        ApiSecurityErrorHandler.class,
        GlobalExceptionHandler.class,
        LocaleConfig.class,
        PlatformAdminEndpointsHttpIntegrationTest.TestBeans.class
})
class PlatformAdminEndpointsHttpIntegrationTest {

    private static final UUID NON_ADMIN_USER_ID =
            UUID.fromString("00000000-0000-0000-0000-000000000002");
    private static final UUID ADMIN_USER_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final UUID OWNER_USER_ID = UUID.fromString("00000000-0000-0000-0000-000000000003");
    private static final UUID RESTAURANT_ID = UUID.fromString("00000000-0000-0000-0000-000000000004");
    private static final String VALID_PROVISION_REQUEST = """
            {
              "ownerEmail": "owner@example.com",
              "ownerFullName": "Restaurant Owner",
              "restaurant": {
                "name": "Test Restaurant",
                "slug": "test-restaurant",
                "township": "Bahan",
                "city": "Yangon",
                "currency": "MMK",
                "timezone": "Asia/Yangon"
              }
            }
            """;

    @Autowired
    private MockMvc mockMvc;

    @Autowired private SupabaseAuthAdminClient authAdminClient;
    @Autowired private RestaurantManagementService restaurantManagementService;
    @Autowired private ProfileRepository profileRepository;

    @BeforeEach
    void resetCollaborators() {
        reset(authAdminClient, restaurantManagementService, profileRepository);
    }

    @Test
    void unauthenticatedRequestsCannotAccessAnyPlatformEndpoint() throws Exception {
        mockMvc.perform(get("/api/v1/platform/overview"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/v1/platform/restaurants"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/v1/platform/restaurants")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(VALID_PROVISION_REQUEST))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void authenticatedUserOutsideServerAllowlistGetsForbiddenOnEveryEndpoint() throws Exception {
        mockMvc.perform(get("/api/v1/platform/overview")
                        .with(SecurityMockMvcRequestPostProcessors.jwt()
                                .jwt(token -> token.subject(NON_ADMIN_USER_ID.toString()))))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/v1/platform/restaurants")
                        .with(SecurityMockMvcRequestPostProcessors.jwt()
                                .jwt(token -> token.subject(NON_ADMIN_USER_ID.toString()))))
                .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/v1/platform/restaurants")
                        .with(SecurityMockMvcRequestPostProcessors.jwt()
                                .jwt(token -> token.subject(NON_ADMIN_USER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(VALID_PROVISION_REQUEST))
                .andExpect(status().isForbidden());
        verifyNoInteractions(authAdminClient, restaurantManagementService, profileRepository);
    }

    @Test
    void platformAdminProvisionsThroughControllerAndRealIdentityServiceWithoutQrSecrets() throws Exception {
        when(authAdminClient.inviteByEmail("owner@example.com", "Restaurant Owner"))
                .thenReturn(new SupabaseAuthAdminClient.AuthUser(OWNER_USER_ID, "owner@example.com"));
        var now = OffsetDateTime.now();
        var restaurant = new RestaurantResponse(RESTAURANT_ID, "Test Restaurant", "test-restaurant", null,
                null, null, null, null, null, "Bahan", "Yangon", null, null, null, true, now, now);
        when(restaurantManagementService.createRestaurantForPlatformAdmin(eq(OWNER_USER_ID), any()))
                .thenReturn(new RestaurantOnboardingResponse(restaurant, "OWNER", "MMK", "Asia/Yangon", "raw-qr-secret"));

        mockMvc.perform(post("/api/v1/platform/restaurants")
                        .with(SecurityMockMvcRequestPostProcessors.jwt().jwt(token -> token.subject(ADMIN_USER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON).content(VALID_PROVISION_REQUEST))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.restaurant.id").value(RESTAURANT_ID.toString()))
                .andExpect(jsonPath("$.ownerUserId").value(OWNER_USER_ID.toString()))
                .andExpect(jsonPath("$.ownerInvitationStatus").value("INVITED"))
                .andExpect(jsonPath("$.commonQrToken").doesNotExist())
                .andExpect(jsonPath("$.commonQrUrl").doesNotExist());
        verify(profileRepository, never()).findFirstByEmailIgnoreCase(any());
    }

    @Test
    void duplicateSlugReturnsConflictBeforeCallingInvitationProvider() throws Exception {
        doThrow(new ApiException(HttpStatus.CONFLICT, "RESTAURANT_SLUG_EXISTS", "error.restaurant.slug-exists"))
                .when(restaurantManagementService).validatePlatformProvisioningRequest(any());
        mockMvc.perform(post("/api/v1/platform/restaurants")
                        .with(SecurityMockMvcRequestPostProcessors.jwt().jwt(token -> token.subject(ADMIN_USER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON).content(VALID_PROVISION_REQUEST))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("RESTAURANT_SLUG_EXISTS"));
        verifyNoInteractions(authAdminClient, profileRepository);
    }

    @Test
    void providerUnavailableReturnsActionableFailureWithoutRestaurantCreation() throws Exception {
        when(authAdminClient.inviteByEmail(any(), any()))
                .thenThrow(new SupabaseAuthAdminException("provider unavailable", false, false, null));
        mockMvc.perform(post("/api/v1/platform/restaurants")
                        .with(SecurityMockMvcRequestPostProcessors.jwt().jwt(token -> token.subject(ADMIN_USER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON).content(VALID_PROVISION_REQUEST))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value("PLATFORM_OWNER_INVITATION_PROVIDER_ERROR"));
        verify(restaurantManagementService, never()).createRestaurantForPlatformAdmin(any(), any());
    }

    @Test
    void invalidProvisioningRequestIsRejectedBeforeServiceSideEffects() throws Exception {
        mockMvc.perform(post("/api/v1/platform/restaurants")
                        .with(SecurityMockMvcRequestPostProcessors.jwt().jwt(token -> token.subject(ADMIN_USER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON).content(VALID_PROVISION_REQUEST.replace("owner@example.com", "invalid-email")))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(authAdminClient, restaurantManagementService, profileRepository);
    }

    @TestConfiguration
    static class TestBeans {
        @Bean("platformAdminAuthorization")
        PlatformAdminAuthorization platformAdminAuthorization(
                RestaurantAuthorization restaurantAuthorization,
                Environment environment) {
            return new PlatformAdminAuthorization(
                    restaurantAuthorization,
                    environment.getProperty("app.security.platform-admin-user-ids", ""));
        }

        @Bean("restaurantAuthorization")
        RestaurantAuthorization restaurantAuthorization() {
            // This method reads the authenticated JwtAuthenticationToken subject only;
            // repository collaborators are unnecessary for platform allowlist checks.
            return new RestaurantAuthorization(null, null, null);
        }

        @Bean
        PlatformAdminDashboardService platformAdminDashboardService(
                PlatformAdminAuthorization authorization) {
            // These services reject non-admin identities before touching repositories.
            return new PlatformAdminDashboardService(authorization, null, null, null);
        }

        @Bean
        PlatformRestaurantProvisioningService platformRestaurantProvisioningService(
                PlatformAdminAuthorization authorization, SupabaseAuthAdminClient auth,
                ProfileRepository profiles, RestaurantManagementService restaurants) {
            return new PlatformRestaurantProvisioningService(
                    authorization, auth, profiles, restaurants, "http://localhost:3000");
        }

        @Bean SupabaseAuthAdminClient authAdminClient() { return mock(SupabaseAuthAdminClient.class); }
        @Bean ProfileRepository profileRepository() { return mock(ProfileRepository.class); }
        @Bean RestaurantManagementService restaurantManagementService() { return mock(RestaurantManagementService.class); }
    }
}
