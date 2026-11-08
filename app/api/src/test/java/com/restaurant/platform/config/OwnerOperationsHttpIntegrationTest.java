package com.restaurant.platform.config;

import com.restaurant.platform.common.error.ApiSecurityErrorHandler;
import com.restaurant.platform.common.error.GlobalExceptionHandler;
import com.restaurant.platform.controller.DeliverySettingsController;
import com.restaurant.platform.controller.RestaurantManagementController;
import com.restaurant.platform.controller.RestaurantMemberController;
import com.restaurant.platform.controller.RestaurantNotificationController;
import com.restaurant.platform.entity.Restaurant;
import com.restaurant.platform.entity.RestaurantMember;
import com.restaurant.platform.repository.*;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.security.RestaurantRole;
import com.restaurant.platform.service.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.json.JsonCompareMode;
import org.springframework.test.web.servlet.MockMvc;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(controllers = {RestaurantNotificationController.class, DeliverySettingsController.class,
        RestaurantManagementController.class, RestaurantMemberController.class}, properties = {
        "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://auth.example.test/auth/v1",
        "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=https://auth.example.test/auth/v1/.well-known/jwks.json",
        "app.security.jwt.required-audience=authenticated", "app.security.jwt.signing-algorithm=ES256",
        "app.cors.allowed-origins=http://localhost:3000"
})
@Import({SecurityConfig.class, ApiSecurityErrorHandler.class, GlobalExceptionHandler.class, LocaleConfig.class,
        RestaurantAuthorization.class, RestaurantNotificationService.class, DeliveryAssignmentOptionsService.class,
        RestaurantMemberService.class, RestaurantManagementService.class})
class OwnerOperationsHttpIntegrationTest {
    static final UUID RESTAURANT = UUID.randomUUID(), ACTOR = UUID.randomUUID();
    static final String BASE = "/api/v1/restaurants/" + RESTAURANT;
    @Autowired MockMvc mvc;
    @MockitoBean JwtDecoder decoder;
    @MockitoBean RestaurantMemberRepository members;
    @MockitoBean DeliveryRepository deliveries;
    @MockitoBean OrderRepository orders;
    @MockitoBean ProfileRepository profiles;
    @MockitoBean AppNotificationRepository notifications;
    @MockitoBean DeliveryService deliveryService;
    @MockitoBean RestaurantRepository restaurants;
    @MockitoBean RestaurantSettingsRepository settings;
    @MockitoBean SupabaseAuthAdminClient authAdmin;

    void member(RestaurantRole role) {
        member(RESTAURANT, role);
    }

    private void member(UUID restaurantId, RestaurantRole role) {
        RestaurantMember member = new RestaurantMember();
        member.setRestaurantId(restaurantId);
        member.setUserId(ACTOR);
        member.setRole(role);
        when(members.findByRestaurantIdAndUserId(restaurantId, ACTOR)).thenReturn(Optional.of(member));
    }

    private void activeRestaurant(UUID restaurantId, String name, String slug) {
        Restaurant restaurant = new Restaurant();
        restaurant.setId(restaurantId);
        restaurant.setName(name);
        restaurant.setSlug(slug);
        restaurant.setIsActive(true);
        when(restaurants.findByIdAndIsActiveTrue(restaurantId)).thenReturn(Optional.of(restaurant));
    }

    @Test void aDualMemberReceivesOnlyTheRequestedRestaurantMembership() throws Exception {
        UUID otherRestaurant = UUID.randomUUID();
        member(RestaurantRole.OWNER);
        member(otherRestaurant, RestaurantRole.STAFF);
        activeRestaurant(RESTAURANT, "Restaurant A", "restaurant-a");
        activeRestaurant(otherRestaurant, "Restaurant B", "restaurant-b");
        var identity = jwt().jwt(token -> token.subject(ACTOR.toString()));

        mvc.perform(get(BASE + "/membership").with(identity).header("X-Restaurant-Id", otherRestaurant.toString()))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(content().json("""
                        {"restaurantId":"%s","name":"Restaurant A","slug":"restaurant-a","role":"OWNER","active":true}
                        """.formatted(RESTAURANT), JsonCompareMode.STRICT));
        verify(restaurants, never()).findByIdAndIsActiveTrue(otherRestaurant);
        mvc.perform(get("/api/v1/restaurants/" + otherRestaurant + "/membership").with(identity))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.restaurantId").value(otherRestaurant.toString()))
                .andExpect(jsonPath("$.role").value("STAFF"));
        verify(members, never()).findByUserId(any());
    }

    @Test void membershipRejectsAnonymousInactiveAndForeignRestaurantAccess() throws Exception {
        UUID otherRestaurant = UUID.randomUUID();
        String otherPath = "/api/v1/restaurants/" + otherRestaurant + "/membership";
        member(RestaurantRole.OWNER);
        var forged = jwt().jwt(token -> token.subject(ACTOR.toString())
                .claim("role", "OWNER").claim("restaurantId", otherRestaurant.toString()));

        mvc.perform(get(BASE + "/membership")).andExpect(status().isUnauthorized());
        mvc.perform(get(otherPath).with(forged).header("X-Restaurant-Id", RESTAURANT.toString()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("INSUFFICIENT_RESTAURANT_PERMISSION"));
        verifyNoInteractions(restaurants);
        mvc.perform(get(BASE + "/membership").with(forged)).andExpect(status().isForbidden());
    }
    @Test void anonymousRequestsCannotReachNewOperationalRoutes() throws Exception {
        mvc.perform(get(BASE + "/notifications")).andExpect(status().isUnauthorized());
        mvc.perform(patch(BASE + "/notifications/" + UUID.randomUUID() + "/read")).andExpect(status().isUnauthorized());
        mvc.perform(get(BASE + "/delivery-settings/assignment-options")).andExpect(status().isUnauthorized());
        verifyNoInteractions(notifications, profiles, members);
    }
    @Test void forgedClaimsCannotReplaceMembershipOfConfiguredRestaurant() throws Exception {
        var forged = jwt().jwt(token -> token.subject(ACTOR.toString()).claim("role", "OWNER").claim("restaurantId", RESTAURANT.toString()));
        mvc.perform(get(BASE + "/notifications").with(forged)).andExpect(status().isForbidden());
        mvc.perform(get(BASE + "/delivery-settings/assignment-options").with(forged)).andExpect(status().isForbidden());
        verifyNoInteractions(notifications, profiles);
    }
    @Test void managerGetsNarrowAssignmentOptionsWithoutMemberAdministration() throws Exception {
        member(RestaurantRole.MANAGER);
        var manager = members.findByRestaurantIdAndUserId(RESTAURANT, ACTOR).orElseThrow();
        when(members.findEligibleDeliveryMembers(RESTAURANT)).thenReturn(List.of(manager));
        var subject = jwt().jwt(token -> token.subject(ACTOR.toString()).claim("role", "OWNER"));
        mvc.perform(get(BASE + "/delivery-settings/assignment-options").with(subject))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].userId").value(ACTOR.toString()))
                .andExpect(jsonPath("$[0].role").value("MANAGER"));
        mvc.perform(get(BASE + "/members").with(subject)).andExpect(status().isForbidden());
        mvc.perform(post(BASE + "/members/transfer-ownership").with(subject).contentType("application/json")
                        .content("{\"newOwnerUserId\":\"" + UUID.randomUUID() + "\"}"))
                .andExpect(status().isForbidden());
        verify(members, never()).findByRestaurantIdOrderByCreatedAtAsc(any());
        verify(members, never()).findByRestaurantIdAndUserIdForUpdate(any(), any());
        verifyNoInteractions(authAdmin);
    }
    @Test void staffCannotEnumerateDrivers() throws Exception {
        member(RestaurantRole.STAFF);
        mvc.perform(get(BASE + "/delivery-settings/assignment-options").with(jwt().jwt(token -> token.subject(ACTOR.toString()))))
                .andExpect(status().isForbidden());
        verifyNoInteractions(profiles);
    }
    @Test void ownerInboxUsesTenantAndJwtAndDoesNotLeakAnotherNotificationsId() throws Exception {
        member(RestaurantRole.OWNER);
        when(notifications.findForRestaurantUser(RESTAURANT, ACTOR, null)).thenReturn(List.of());
        mvc.perform(get(BASE + "/notifications").with(jwt().jwt(token -> token.subject(ACTOR.toString()))))
                .andExpect(status().isOk()).andExpect(content().json("[]"));
        UUID notificationId = UUID.randomUUID();
        mvc.perform(patch(BASE + "/notifications/" + notificationId + "/read").with(jwt().jwt(token -> token.subject(ACTOR.toString()))))
                .andExpect(status().isNotFound());
        verify(notifications).findForRestaurantUserById(RESTAURANT, ACTOR, notificationId);
        verify(notifications, never()).findByUserIdOrderByCreatedAtDesc(any());
        verify(notifications, never()).save(any());
    }
}
