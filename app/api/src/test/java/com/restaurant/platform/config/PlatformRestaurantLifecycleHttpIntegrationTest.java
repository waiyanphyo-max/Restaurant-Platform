package com.restaurant.platform.config;

import com.restaurant.platform.common.error.ApiSecurityErrorHandler;
import com.restaurant.platform.common.error.GlobalExceptionHandler;
import com.restaurant.platform.controller.PlatformRestaurantLifecycleController;
import com.restaurant.platform.entity.Restaurant;
import com.restaurant.platform.entity.RestaurantSettings;
import com.restaurant.platform.repository.*;
import com.restaurant.platform.security.PlatformAdminAuthorization;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.security.RestaurantRole;
import com.restaurant.platform.service.PlatformRestaurantLifecycleService;
import com.restaurant.platform.service.SupabaseAuthAdminClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Real controller, authorization and service; repository/provider boundaries are controlled locally. */
@WebMvcTest(controllers = PlatformRestaurantLifecycleController.class, properties = {
        "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://auth.example.test/auth/v1",
        "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=https://auth.example.test/auth/v1/.well-known/jwks.json",
        "app.security.jwt.required-audience=authenticated",
        "app.security.jwt.signing-algorithm=ES256",
        "app.cors.allowed-origins=http://localhost:3000",
        "app.public-web-base-url=https://guest.example.test"
})
@Import({SecurityConfig.class, ApiSecurityErrorHandler.class, GlobalExceptionHandler.class,
        LocaleConfig.class, PlatformRestaurantLifecycleService.class,
        PlatformRestaurantLifecycleHttpIntegrationTest.TestBeans.class})
class PlatformRestaurantLifecycleHttpIntegrationTest {
    private static final UUID ADMIN = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final UUID RESTAURANT = UUID.fromString("00000000-0000-0000-0000-000000000010");
    private static final String BASE = "/api/v1/platform/restaurants/" + RESTAURANT;
    private static final String CONFIGURATION = """
            {"name":"Updated Garden","slug":"updated-garden","logoUrl":"https://cdn.example.test/logo.png",
             "configuration":{"primaryColor":"#123456","guestDomains":{"staging":[],"production":["garden.example.test"]}}}
            """;

    @Autowired private MockMvc mvc;
    @MockitoBean private RestaurantRepository restaurants;
    @MockitoBean private RestaurantSettingsRepository settings;
    @MockitoBean private RestaurantMemberRepository members;
    @MockitoBean private OrderRepository orders;
    @MockitoBean private ProfileRepository profiles;
    @MockitoBean private RestaurantPlatformConfigurationRepository configurations;
    @MockitoBean private SupabaseAuthAdminClient authAdmin;

    @BeforeEach
    void setUp() {
        var restaurant = new Restaurant();
        restaurant.setId(RESTAURANT);
        restaurant.setName("Garden");
        restaurant.setSlug("garden");
        restaurant.setTownship("Bahan");
        restaurant.setCity("Yangon");
        when(restaurants.findById(RESTAURANT)).thenReturn(Optional.of(restaurant));
        when(restaurants.saveAndFlush(any())).thenAnswer(invocation -> invocation.getArgument(0));
        var restaurantSettings = new RestaurantSettings();
        restaurantSettings.setRestaurantId(RESTAURANT);
        restaurantSettings.setCommonQrToken("raw-qr-secret-never-serialized");
        when(settings.findById(RESTAURANT)).thenReturn(Optional.of(restaurantSettings));
        when(members.findByRestaurantIdAndRoleOrderByCreatedAtAsc(RESTAURANT, RestaurantRole.OWNER))
                .thenReturn(List.of());
        when(members.countByRestaurantId(RESTAURANT)).thenReturn(3L);
        when(orders.countByRestaurantId(RESTAURANT)).thenReturn(9L);
    }

    @Test
    void unauthenticatedRequestsAreDeniedOnAllLifecycleRoutes() throws Exception {
        mvc.perform(get(BASE)).andExpect(status().isUnauthorized());
        mvc.perform(patch(BASE + "/status").contentType(MediaType.APPLICATION_JSON)
                .content("{\"active\":false}")).andExpect(status().isUnauthorized());
        mvc.perform(put(BASE + "/configuration").contentType(MediaType.APPLICATION_JSON)
                .content(CONFIGURATION)).andExpect(status().isUnauthorized());
        verifyNoInteractions(restaurants, settings, members, orders, profiles, configurations, authAdmin);
    }

    @Test
    void restaurantMembershipDoesNotGrantPlatformAdministration() throws Exception {
        var member = SecurityMockMvcRequestPostProcessors.jwt().jwt(token ->
                token.subject("00000000-0000-0000-0000-000000000002")
                        .claim("role", "OWNER").claim("restaurantId", RESTAURANT.toString()));
        mvc.perform(get(BASE).with(member)).andExpect(status().isForbidden());
        mvc.perform(patch(BASE + "/status").with(member).contentType(MediaType.APPLICATION_JSON)
                .content("{\"active\":false}")).andExpect(status().isForbidden());
        mvc.perform(put(BASE + "/configuration").with(member).contentType(MediaType.APPLICATION_JSON)
                .content(CONFIGURATION)).andExpect(status().isForbidden());
        verifyNoInteractions(restaurants, settings, members, orders, profiles, configurations, authAdmin);
    }

    @Test
    void adminGetsActualRequestedRestaurantDetailWithoutQrCredentials() throws Exception {
        mvc.perform(get(BASE).with(admin())).andExpect(status().isOk())
                .andExpect(jsonPath("$.restaurant.id").value(RESTAURANT.toString()))
                .andExpect(jsonPath("$.memberCount").value(3))
                .andExpect(jsonPath("$.orderCount").value(9))
                .andExpect(jsonPath("$.currency").value("MMK"))
                .andExpect(jsonPath("$.configuration.guestDomains.production").isEmpty())
                .andExpect(jsonPath("$.qrSetupUrl").value("https://guest.example.test/workspace?restaurantId=" + RESTAURANT + "&setup=qr"))
                .andExpect(content().string(not(containsString("raw-qr-secret-never-serialized"))))
                .andExpect(jsonPath("$.commonQrToken").doesNotExist());
    }

    @Test
    void adminCanChangeStatusAndBrandingThroughRealHttpContract() throws Exception {
        mvc.perform(patch(BASE + "/status").with(admin()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"active\":false}")).andExpect(status().isOk())
                .andExpect(jsonPath("$.restaurant.active").value(false));
        mvc.perform(put(BASE + "/configuration").with(admin()).contentType(MediaType.APPLICATION_JSON)
                .content(CONFIGURATION)).andExpect(status().isOk())
                .andExpect(jsonPath("$.restaurant.name").value("Updated Garden"))
                .andExpect(jsonPath("$.restaurant.slug").value("updated-garden"));
        verify(configurations).save(argThat(row -> RESTAURANT.equals(row.getRestaurantId())
                && row.getConfiguration().guestDomains().production().equals(List.of("garden.example.test"))));
    }

    @Test
    void duplicateSlugAndInvalidInputsReturnActionableClientErrors() throws Exception {
        when(restaurants.existsBySlugAndIdNot("updated-garden", RESTAURANT)).thenReturn(true);
        mvc.perform(put(BASE + "/configuration").with(admin()).contentType(MediaType.APPLICATION_JSON)
                .content(CONFIGURATION)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("RESTAURANT_SLUG_EXISTS"));
        mvc.perform(patch(BASE + "/status").with(admin()).contentType(MediaType.APPLICATION_JSON)
                .content("{}")).andExpect(status().isBadRequest());
        mvc.perform(put(BASE + "/configuration").with(admin()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Garden\",\"slug\":\"bad slug\"}"))
                .andExpect(status().isBadRequest());
        verify(configurations, never()).save(any());
    }

    @Test
    void differentRestaurantUuidCannotReuseFirstRestaurantsDetail() throws Exception {
        UUID other = UUID.randomUUID();
        mvc.perform(get("/api/v1/platform/restaurants/" + other).with(admin()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RESTAURANT_NOT_FOUND"));
        verifyNoInteractions(settings, members, orders, profiles, configurations, authAdmin);
    }

    private static SecurityMockMvcRequestPostProcessors.JwtRequestPostProcessor admin() {
        return SecurityMockMvcRequestPostProcessors.jwt().jwt(token -> token.subject(ADMIN.toString()));
    }

    @TestConfiguration
    static class TestBeans {
        @Bean("restaurantAuthorization")
        RestaurantAuthorization restaurantAuthorization() {
            return new RestaurantAuthorization(null, null, null);
        }

        @Bean("platformAdminAuthorization")
        PlatformAdminAuthorization platformAdminAuthorization(RestaurantAuthorization authorization) {
            return new PlatformAdminAuthorization(authorization, ADMIN.toString());
        }
    }
}
