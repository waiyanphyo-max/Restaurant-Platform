package com.restaurant.platform.config;

import com.restaurant.platform.common.error.ApiSecurityErrorHandler;
import com.restaurant.platform.common.error.GlobalExceptionHandler;
import com.restaurant.platform.controller.PlatformAdminDashboardController;
import com.restaurant.platform.controller.PlatformRestaurantProvisioningController;
import com.restaurant.platform.security.PlatformAdminAuthorization;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.service.PlatformAdminDashboardService;
import com.restaurant.platform.service.PlatformRestaurantProvisioningService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.env.Environment;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
                PlatformAdminAuthorization authorization) {
            return new PlatformRestaurantProvisioningService(
                    authorization, null, null, null, "http://localhost:3000");
        }
    }
}
