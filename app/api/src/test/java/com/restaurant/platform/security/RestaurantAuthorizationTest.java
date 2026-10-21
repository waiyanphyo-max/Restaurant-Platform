package com.restaurant.platform.security;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.entity.Delivery;
import com.restaurant.platform.entity.Order;
import com.restaurant.platform.entity.RestaurantMember;
import com.restaurant.platform.repository.DeliveryRepository;
import com.restaurant.platform.repository.OrderRepository;
import com.restaurant.platform.repository.RestaurantMemberRepository;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class RestaurantAuthorizationTest {

    private RestaurantMemberRepository memberRepository;
    private DeliveryRepository deliveryRepository;
    private OrderRepository orderRepository;
    private RestaurantAuthorization authorization;

    private final UUID userId = UUID.randomUUID();
    private final UUID restaurantA = UUID.randomUUID();
    private final UUID restaurantB = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        memberRepository = mock(RestaurantMemberRepository.class);
        deliveryRepository = mock(DeliveryRepository.class);
        orderRepository = mock(OrderRepository.class);
        authorization = new RestaurantAuthorization(
                memberRepository, deliveryRepository, orderRepository);
    }

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void authenticatedIdentityComesFromJwtSubject() {
        UUID subject = UUID.randomUUID();
        authenticate(subject);

        assertEquals(subject, authorization.requireAuthenticatedUserId());
    }

    @Test
    void rejectsAuthenticatedNonJwtPrincipalAsAnIdentitySource() {
        SecurityContextHolder.getContext().setAuthentication(
                UsernamePasswordAuthenticationToken.authenticated(
                        userId.toString(), "not-a-jwt", List.of()));

        ApiException exception = assertThrows(
                ApiException.class, authorization::requireAuthenticatedUserId);

        assertEquals(HttpStatus.UNAUTHORIZED, exception.getStatus());
        assertEquals("INVALID_AUTHENTICATED_USER_ID", exception.getCode());
    }

    @Test
    void unauthenticatedRequestReceives401() {
        ApiException exception = assertThrows(
                ApiException.class, authorization::requireAuthenticatedUserId);

        assertEquals(HttpStatus.UNAUTHORIZED, exception.getStatus());
        assertEquals("AUTHENTICATION_REQUIRED", exception.getCode());
    }

    @Test
    void membershipInOneRestaurantDoesNotGrantPermissionInAnother() {
        authenticate(userId);
        when(memberRepository.findByRestaurantIdAndUserId(restaurantA, userId))
                .thenReturn(Optional.of(member(restaurantA, userId, RestaurantRole.OWNER)));
        when(memberRepository.findByRestaurantIdAndUserId(restaurantB, userId))
                .thenReturn(Optional.empty());

        assertTrue(authorization.canReadOrders(restaurantA));
        assertFalse(authorization.canReadOrders(restaurantB));
    }

    @Test
    void driverCanReadOnlyDeliveryAssignedToTheirJwtUser() {
        authenticate(userId);
        UUID assignedDeliveryId = UUID.randomUUID();
        UUID assignedOrderId = UUID.randomUUID();
        Delivery assignedDelivery = delivery(assignedOrderId);

        when(memberRepository.findByRestaurantIdAndUserId(restaurantA, userId))
                .thenReturn(Optional.of(member(restaurantA, userId, RestaurantRole.DELIVERY_DRIVER)));
        when(deliveryRepository.findByIdAndDriverUserId(assignedDeliveryId, userId))
                .thenReturn(Optional.of(assignedDelivery));
        when(orderRepository.findByIdAndRestaurantId(assignedOrderId, restaurantA))
                .thenReturn(Optional.of(new Order()));

        assertTrue(authorization.canAccessDelivery(restaurantA, assignedDeliveryId));
        assertTrue(authorization.canUpdateDeliveryStatus(restaurantA, assignedDeliveryId));
        assertFalse(authorization.canAccessDelivery(restaurantA, UUID.randomUUID()));
    }

    @Test
    void driverCannotReadDeliveryAssignedToAnotherDriver() {
        authenticate(userId);
        UUID otherDeliveryId = UUID.randomUUID();

        when(memberRepository.findByRestaurantIdAndUserId(restaurantA, userId))
                .thenReturn(Optional.of(member(restaurantA, userId, RestaurantRole.DELIVERY_DRIVER)));
        when(deliveryRepository.findByIdAndDriverUserId(otherDeliveryId, userId))
                .thenReturn(Optional.empty());

        assertFalse(authorization.canAccessDelivery(restaurantA, otherDeliveryId));
        ApiException exception = assertThrows(
                ApiException.class,
                () -> authorization.requireDeliveryAccess(restaurantA, otherDeliveryId));
        assertEquals(HttpStatus.NOT_FOUND, exception.getStatus());
        assertEquals("DELIVERY_NOT_FOUND", exception.getCode());
    }

    @Test
    void restaurantManagerCannotAccessDeliveryWhoseOrderBelongsToAnotherRestaurant() {
        authenticate(userId);
        UUID deliveryId = UUID.randomUUID();
        UUID foreignOrderId = UUID.randomUUID();

        when(memberRepository.findByRestaurantIdAndUserId(restaurantA, userId))
                .thenReturn(Optional.of(member(restaurantA, userId, RestaurantRole.MANAGER)));
        when(deliveryRepository.findById(deliveryId))
                .thenReturn(Optional.of(delivery(foreignOrderId)));
        when(orderRepository.findByIdAndRestaurantId(foreignOrderId, restaurantA))
                .thenReturn(Optional.empty());

        assertFalse(authorization.canAccessDelivery(restaurantA, deliveryId));
    }

    @Test
    void rejectsClientSuppliedUserIdThatDoesNotMatchJwtSubject() {
        authenticate(userId);

        ApiException exception = assertThrows(
                ApiException.class,
                () -> authorization.requireAuthenticatedUserMatches(UUID.randomUUID()));

        assertEquals(HttpStatus.FORBIDDEN, exception.getStatus());
        assertEquals("AUTHENTICATED_USER_MISMATCH", exception.getCode());
    }

    @Test
    void missingRestaurantMembershipCannotUseProtectedPermission() {
        authenticate(userId);
        when(memberRepository.findByRestaurantIdAndUserId(restaurantA, userId))
                .thenReturn(Optional.empty());

        ApiException exception = assertThrows(
                ApiException.class,
                () -> authorization.requirePermission(restaurantA, RestaurantPermission.ORDER_READ));

        assertEquals(HttpStatus.FORBIDDEN, exception.getStatus());
        assertEquals("INSUFFICIENT_RESTAURANT_PERMISSION", exception.getCode());
    }

    private static RestaurantMember member(UUID restaurantId, UUID memberUserId, RestaurantRole role) {
        RestaurantMember member = new RestaurantMember();
        member.setRestaurantId(restaurantId);
        member.setUserId(memberUserId);
        member.setRole(role);
        return member;
    }

    private static Delivery delivery(UUID orderId) {
        Delivery delivery = new Delivery();
        delivery.setOrderId(orderId);
        return delivery;
    }

    private static void authenticate(UUID subject) {
        Instant now = Instant.now();
        Jwt jwt = Jwt.withTokenValue("unit-test-token")
                .header("alg", "ES256")
                .claim("sub", subject.toString())
                .issuedAt(now.minusSeconds(1))
                .expiresAt(now.plusSeconds(60))
                .build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt, List.of()));
    }
}
