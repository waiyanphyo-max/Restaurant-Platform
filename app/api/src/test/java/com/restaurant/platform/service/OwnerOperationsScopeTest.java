package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.entity.*;
import com.restaurant.platform.repository.*;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.security.RestaurantRole;
import org.junit.jupiter.api.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import java.time.OffsetDateTime;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Exercises new M8-A routes through the real membership/permission resolver. */
class OwnerOperationsScopeTest {
    final UUID restaurantId = UUID.randomUUID(), otherRestaurantId = UUID.randomUUID(), actorId = UUID.randomUUID();
    RestaurantMemberRepository members;
    ProfileRepository profiles;
    AppNotificationRepository notifications;
    RestaurantNotificationService inbox;
    DeliveryAssignmentOptionsService options;

    @BeforeEach void setUp() {
        members = mock(RestaurantMemberRepository.class);
        profiles = mock(ProfileRepository.class);
        notifications = mock(AppNotificationRepository.class);
        var auth = new RestaurantAuthorization(members, mock(DeliveryRepository.class), mock(OrderRepository.class));
        inbox = new RestaurantNotificationService(notifications, auth);
        options = new DeliveryAssignmentOptionsService(members, profiles, auth);
        Jwt token = Jwt.withTokenValue("verified-test-token").header("alg", "RS256").subject(actorId.toString()).build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(token, List.of()));
    }
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }
    void member(RestaurantRole role) {
        RestaurantMember m = new RestaurantMember(); m.setUserId(actorId); m.setRestaurantId(restaurantId); m.setRole(role);
        when(members.findByRestaurantIdAndUserId(restaurantId, actorId)).thenReturn(Optional.of(m));
    }

    @Test void missingJwtCannotQueryInboxOrOptions() {
        SecurityContextHolder.clearContext();
        assertEquals(HttpStatus.UNAUTHORIZED, assertThrows(ApiException.class, () -> inbox.list(restaurantId, null)).getStatus());
        assertEquals(HttpStatus.UNAUTHORIZED, assertThrows(ApiException.class, () -> options.list(restaurantId)).getStatus());
        verifyNoInteractions(notifications, profiles);
    }
    @Test void anotherRestaurantIsDeniedBeforeAnyNotificationOrDriverRead() {
        member(RestaurantRole.OWNER);
        assertEquals(HttpStatus.FORBIDDEN, assertThrows(ApiException.class, () -> inbox.list(otherRestaurantId, null)).getStatus());
        assertEquals(HttpStatus.FORBIDDEN, assertThrows(ApiException.class, () -> inbox.markRead(otherRestaurantId, UUID.randomUUID())).getStatus());
        assertEquals(HttpStatus.FORBIDDEN, assertThrows(ApiException.class, () -> options.list(otherRestaurantId)).getStatus());
        verifyNoInteractions(notifications, profiles);
    }
    @Test void ownerAndManagerCanReadOnlyDedicatedDriverOptions() {
        for (RestaurantRole role : List.of(RestaurantRole.OWNER, RestaurantRole.MANAGER)) {
            member(role);
            UUID driverId = UUID.randomUUID();
            RestaurantMember driver = new RestaurantMember(); driver.setUserId(driverId); driver.setRole(RestaurantRole.DELIVERY_DRIVER);
            driver.setRestaurantId(restaurantId);
            Profile p = new Profile(); p.setId(driverId); p.setFullName("Driver"); p.setEmail("driver@example.test");
            when(members.findByRestaurantIdAndRoleOrderByCreatedAtAsc(restaurantId, RestaurantRole.DELIVERY_DRIVER)).thenReturn(List.of(driver));
            when(profiles.findAllById(List.of(driverId))).thenReturn(List.of(p));
            var result = options.list(restaurantId);
            assertEquals(driverId, result.getFirst().userId());
            assertEquals(1, result.size());
        }
        verify(members, never()).findByRestaurantIdOrderByCreatedAtAsc(any());
    }
    @Test void staffAndDriverCannotEnumerateAssignmentOptions() {
        for (RestaurantRole role : List.of(RestaurantRole.STAFF, RestaurantRole.DELIVERY_DRIVER)) {
            member(role);
            assertEquals(HttpStatus.FORBIDDEN, assertThrows(ApiException.class, () -> options.list(restaurantId)).getStatus());
        }
        verifyNoInteractions(profiles);
    }
    @Test void inboxAlwaysUsesBothConfiguredRestaurantAndVerifiedSubject() {
        member(RestaurantRole.OWNER);
        when(notifications.findForRestaurantUser(restaurantId, actorId, "PENDING")).thenReturn(List.of());
        assertTrue(inbox.list(restaurantId, " pending ").isEmpty());
        verify(notifications).findForRestaurantUser(restaurantId, actorId, "PENDING");
        verify(notifications, never()).findByUserIdOrderByCreatedAtDesc(any());
    }
    @Test void crossTenantOrOtherUsersNotificationIdIsNotFoundAndNeverWritten() {
        member(RestaurantRole.OWNER); UUID notificationId = UUID.randomUUID();
        when(notifications.findForRestaurantUserById(restaurantId, actorId, notificationId)).thenReturn(Optional.empty());
        assertEquals(HttpStatus.NOT_FOUND, assertThrows(ApiException.class, () -> inbox.markRead(restaurantId, notificationId)).getStatus());
        verify(notifications, never()).save(any());
    }
    @Test void readIsIdempotentPreservingOriginalTimestampAndNoOtherUsersRecord() {
        member(RestaurantRole.OWNER); UUID notificationId = UUID.randomUUID(); OffsetDateTime at = OffsetDateTime.now().minusDays(1);
        AppNotification n = new AppNotification(); n.setId(notificationId); n.setUserId(actorId); n.setStatus("READ"); n.setReadAt(at);
        when(notifications.findForRestaurantUserById(restaurantId, actorId, notificationId)).thenReturn(Optional.of(n));
        when(notifications.save(n)).thenReturn(n);
        assertEquals(at, inbox.markRead(restaurantId, notificationId).readAt());
        assertEquals("READ", n.getStatus());
    }
    @Test void invalidInboxFilterFailsBeforeQuery() {
        member(RestaurantRole.OWNER);
        assertEquals(HttpStatus.BAD_REQUEST, assertThrows(ApiException.class, () -> inbox.list(restaurantId, "EVERYONE")).getStatus());
        verifyNoInteractions(notifications);
    }
}
