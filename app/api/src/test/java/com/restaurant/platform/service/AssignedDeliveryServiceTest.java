package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.entity.Delivery;
import com.restaurant.platform.entity.Order;
import com.restaurant.platform.entity.OrderItem;
import com.restaurant.platform.entity.Restaurant;
import com.restaurant.platform.entity.RestaurantMember;
import com.restaurant.platform.repository.DeliveryRepository;
import com.restaurant.platform.repository.OrderItemRepository;
import com.restaurant.platform.repository.OrderRepository;
import com.restaurant.platform.repository.PaymentRepository;
import com.restaurant.platform.repository.RestaurantMemberRepository;
import com.restaurant.platform.repository.RestaurantRepository;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.security.RestaurantRole;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AssignedDeliveryServiceTest {
    private final UUID restaurantId = UUID.randomUUID();
    private final UUID deliveryId = UUID.randomUUID();
    private final UUID orderId = UUID.randomUUID();
    private final UUID assigneeId = UUID.randomUUID();
    private final RestaurantMemberRepository members = mock(RestaurantMemberRepository.class);
    private final DeliveryRepository deliveries = mock(DeliveryRepository.class);
    private final OrderRepository orders = mock(OrderRepository.class);
    private final RestaurantRepository restaurants = mock(RestaurantRepository.class);
    private final OrderItemRepository items = mock(OrderItemRepository.class);
    private final PaymentRepository payments = mock(PaymentRepository.class);
    private final RestaurantAuthorization authorization = new RestaurantAuthorization(members, deliveries);
    private final AssignedDeliveryService service = new AssignedDeliveryService(
            authorization, deliveries, orders, restaurants, items, payments);
    private final Restaurant restaurant = new Restaurant();
    private final Order order = new Order();

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @ParameterizedTest
    @EnumSource(RestaurantRole.class)
    void assignedWorkerGetsOnlyTheConfirmedOrderPointAndRestaurantPickup(RestaurantRole role) {
        givenAssignedWorker(role);
        restaurant.setLatitude(BigDecimal.ZERO);
        restaurant.setLongitude(BigDecimal.valueOf(180));
        order.setDeliveryLatitude(BigDecimal.valueOf(-90));
        order.setDeliveryLongitude(BigDecimal.ZERO);
        OrderItem item = new OrderItem();
        item.setQuantity(2);
        item.setProductName("Tea");
        item.setSpecialInstruction("Keep upright");
        when(items.findByOrderIdAndRestaurantIdOrderByCreatedAtAsc(orderId, restaurantId))
                .thenReturn(List.of(item));
        when(payments.existsByOrderIdAndMethodAndStatus(orderId, "CASH_ON_DELIVERY", "PENDING"))
                .thenReturn(true);

        var detail = service.getDetail(restaurantId, deliveryId);

        assertEquals("Test Restaurant", detail.pickup().name());
        assertEquals("Station Road, Midtown, City", detail.pickup().address());
        assertEquals(BigDecimal.ZERO, detail.pickup().latitude());
        assertEquals(BigDecimal.valueOf(180), detail.pickup().longitude());
        assertEquals(BigDecimal.valueOf(-90), detail.destination().latitude());
        assertEquals(BigDecimal.ZERO, detail.destination().longitude());
        assertEquals("Confirmed order address", detail.task().deliveryAddress());
        assertEquals("Recipient phone", detail.task().customerPhone());
        assertEquals("Ring bell", detail.task().deliveryNote());
        assertEquals("Keep upright", detail.items().getFirst().specialInstruction());
        assertTrue(detail.cashCollectionRequired());
    }

    @ParameterizedTest
    @CsvSource({"16, ", ", 96", "91, 96", "16, -181", ", "})
    void incompleteAndInvalidPointsKeepTextWithoutAnUnverifiedPin(BigDecimal latitude, BigDecimal longitude) {
        givenAssignedWorker(RestaurantRole.STAFF);
        restaurant.setLatitude(latitude);
        restaurant.setLongitude(longitude);
        order.setDeliveryLatitude(latitude);
        order.setDeliveryLongitude(longitude);

        var detail = service.getDetail(restaurantId, deliveryId);

        assertNotNull(detail.pickup().address());
        assertNotNull(detail.task().deliveryAddress());
        assertNull(detail.pickup().latitude());
        assertNull(detail.pickup().longitude());
        assertNull(detail.destination().latitude());
        assertNull(detail.destination().longitude());
    }

    @ParameterizedTest
    @EnumSource(RestaurantRole.class)
    void unassignedMemberCannotLoadLocationEvenWithManagementPermissions(RestaurantRole role) {
        UUID otherUser = UUID.randomUUID();
        authenticate(otherUser, restaurantId, role);

        ApiException error = assertThrows(ApiException.class, () -> service.getDetail(restaurantId, deliveryId));

        assertEquals(HttpStatus.NOT_FOUND, error.getStatus());
        verify(deliveries).findByIdAndRestaurantIdAndDriverUserId(deliveryId, restaurantId, otherUser);
        verifyNoInteractions(orders, restaurants, items, payments);
    }

    @Test
    void nextReadLosesPrivateDetailsAfterAssignmentIsRevoked() {
        givenAssignedWorker(RestaurantRole.DELIVERY_DRIVER);
        assertEquals(deliveryId, service.getDetail(restaurantId, deliveryId).task().id());
        when(deliveries.findByIdAndRestaurantIdAndDriverUserId(deliveryId, restaurantId, assigneeId))
                .thenReturn(Optional.empty());
        clearInvocations(orders, restaurants, items, payments);

        ApiException error = assertThrows(ApiException.class, () -> service.getDetail(restaurantId, deliveryId));

        assertEquals(HttpStatus.NOT_FOUND, error.getStatus());
        verifyNoInteractions(orders, restaurants, items, payments);
    }

    @Test
    void membershipInAnotherRestaurantDoesNotAuthorizeLocationRead() {
        authenticate(assigneeId, UUID.randomUUID(), RestaurantRole.DELIVERY_DRIVER);

        ApiException error = assertThrows(ApiException.class, () -> service.getDetail(restaurantId, deliveryId));

        assertEquals(HttpStatus.FORBIDDEN, error.getStatus());
        verifyNoInteractions(deliveries, orders, restaurants, items, payments);
    }

    @Test
    void missingAuthenticationCannotReachPrivateRecords() {
        ApiException error = assertThrows(ApiException.class, () -> service.getDetail(restaurantId, deliveryId));

        assertEquals(HttpStatus.UNAUTHORIZED, error.getStatus());
        verifyNoInteractions(members, deliveries, orders, restaurants, items, payments);
    }

    private void givenAssignedWorker(RestaurantRole role) {
        authenticate(assigneeId, restaurantId, role);
        Delivery delivery = new Delivery();
        delivery.setId(deliveryId);
        delivery.setDriverUserId(assigneeId);
        delivery.setOrderId(orderId);
        order.setId(orderId);
        order.setRestaurantId(restaurantId);
        order.setOrderType("DELIVERY");
        order.setTotalAmount(1000L);
        order.setDeliveryAddress("Confirmed order address");
        order.setDeliveryPhone("Recipient phone");
        order.setDeliveryNote("Ring bell");
        restaurant.setName("Test Restaurant");
        restaurant.setStreet("Station Road");
        restaurant.setTownship("Midtown");
        restaurant.setCity("City");
        when(deliveries.findByIdAndRestaurantIdAndDriverUserId(deliveryId, restaurantId, assigneeId))
                .thenReturn(Optional.of(delivery));
        when(orders.findByIdAndRestaurantId(orderId, restaurantId)).thenReturn(Optional.of(order));
        when(restaurants.findById(restaurantId)).thenReturn(Optional.of(restaurant));
    }

    private void authenticate(UUID userId, UUID memberRestaurantId, RestaurantRole role) {
        RestaurantMember member = new RestaurantMember();
        member.setRestaurantId(memberRestaurantId);
        member.setUserId(userId);
        member.setRole(role);
        when(members.findByRestaurantIdAndUserId(memberRestaurantId, userId)).thenReturn(Optional.of(member));
        Jwt jwt = Jwt.withTokenValue("test-token").header("alg", "ES256").subject(userId.toString()).build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt, List.of()));
    }
}
