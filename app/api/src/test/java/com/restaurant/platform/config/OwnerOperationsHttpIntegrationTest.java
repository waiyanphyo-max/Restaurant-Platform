package com.restaurant.platform.config;

import com.restaurant.platform.common.error.ApiSecurityErrorHandler;
import com.restaurant.platform.common.error.GlobalExceptionHandler;
import com.restaurant.platform.controller.DeliverySettingsController;
import com.restaurant.platform.controller.RestaurantNotificationController;
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
import org.springframework.test.web.servlet.MockMvc;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(controllers = {RestaurantNotificationController.class, DeliverySettingsController.class}, properties = {
        "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://auth.example.test/auth/v1",
        "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=https://auth.example.test/auth/v1/.well-known/jwks.json",
        "app.security.jwt.required-audience=authenticated", "app.security.jwt.signing-algorithm=ES256",
        "app.cors.allowed-origins=http://localhost:3000"
})
@Import({SecurityConfig.class, ApiSecurityErrorHandler.class, GlobalExceptionHandler.class, LocaleConfig.class,
        RestaurantAuthorization.class, RestaurantNotificationService.class, DeliveryAssignmentOptionsService.class})
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

    void member(RestaurantRole role) {
        RestaurantMember member = new RestaurantMember(); member.setRestaurantId(RESTAURANT); member.setUserId(ACTOR); member.setRole(role);
        when(members.findByRestaurantIdAndUserId(RESTAURANT, ACTOR)).thenReturn(Optional.of(member));
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
    @Test void managerGetsNarrowDriverOptionsWithoutMemberAdministration() throws Exception {
        member(RestaurantRole.MANAGER);
        when(members.findByRestaurantIdAndRoleOrderByCreatedAtAsc(RESTAURANT, RestaurantRole.DELIVERY_DRIVER)).thenReturn(List.of());
        mvc.perform(get(BASE + "/delivery-settings/assignment-options").with(jwt().jwt(token -> token.subject(ACTOR.toString()))))
                .andExpect(status().isOk()).andExpect(content().json("[]"));
        verify(members, never()).findByRestaurantIdOrderByCreatedAtAsc(any());
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
