package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.delivery.UpdateDeliveryStatusRequest;
import com.restaurant.platform.entity.AppNotification;
import com.restaurant.platform.entity.Delivery;
import com.restaurant.platform.entity.DeliveryStatusHistory;
import com.restaurant.platform.entity.Order;
import com.restaurant.platform.entity.OrderStatusHistory;
import com.restaurant.platform.entity.RestaurantMember;
import com.restaurant.platform.entity.RestaurantSettings;
import com.restaurant.platform.repository.AppNotificationRepository;
import com.restaurant.platform.repository.DeliveryRepository;
import com.restaurant.platform.repository.DeliveryStatusHistoryRepository;
import com.restaurant.platform.repository.OrderRepository;
import com.restaurant.platform.repository.OrderStatusHistoryRepository;
import com.restaurant.platform.repository.RestaurantMemberRepository;
import com.restaurant.platform.repository.RestaurantSettingsRepository;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.security.RestaurantRole;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

class DeliveryServiceTest {

    private DeliveryRepository deliveryRepository;
    private DeliveryStatusHistoryRepository deliveryHistoryRepository;
    private OrderRepository orderRepository;
    private OrderStatusHistoryRepository orderHistoryRepository;
    private RestaurantSettingsRepository settingsRepository;
    private RestaurantMemberRepository memberRepository;
    private AppNotificationRepository notificationRepository;
    private RestaurantAuthorization authorization;
    private DeliveryService service;

    private final UUID restaurantId = UUID.randomUUID();
    private final UUID orderId = UUID.randomUUID();
    private final UUID deliveryId = UUID.randomUUID();
    private final UUID managerId = UUID.randomUUID();
    private final UUID driverId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        deliveryRepository = mock(DeliveryRepository.class);
        deliveryHistoryRepository = mock(DeliveryStatusHistoryRepository.class);
        orderRepository = mock(OrderRepository.class);
        orderHistoryRepository = mock(OrderStatusHistoryRepository.class);
        settingsRepository = mock(RestaurantSettingsRepository.class);
        memberRepository = mock(RestaurantMemberRepository.class);
        notificationRepository = mock(AppNotificationRepository.class);
        authorization = mock(RestaurantAuthorization.class);
        service = new DeliveryService(
                deliveryRepository,
                deliveryHistoryRepository,
                orderRepository,
                orderHistoryRepository,
                settingsRepository,
                memberRepository,
                notificationRepository,
                authorization);
    }

    @Test
    void readyDeliveryOrderUsesAndPersistsEarliestDriverAsDefault() {
        RestaurantSettings settings = new RestaurantSettings();
        settings.setRestaurantId(restaurantId);
        when(settingsRepository.findById(restaurantId)).thenReturn(Optional.of(settings));
        when(deliveryRepository.findByOrderId(orderId)).thenReturn(Optional.empty());
        when(memberRepository.findByRestaurantIdAndRoleOrderByCreatedAtAsc(
                restaurantId, RestaurantRole.DELIVERY_DRIVER))
                .thenReturn(List.of(driver(driverId)));
        when(deliveryRepository.save(any(Delivery.class))).thenAnswer(invocation -> {
            Delivery saved = invocation.getArgument(0);
            saved.setId(deliveryId);
            return saved;
        });

        Order order = order("READY");
        service.ensureForReadyOrder(order, managerId);

        assertEquals(driverId, settings.getDefaultDeliveryDriverUserId());
        verify(settingsRepository).save(settings);

        var captor = org.mockito.ArgumentCaptor.forClass(Delivery.class);
        verify(deliveryRepository).save(captor.capture());
        assertEquals(orderId, captor.getValue().getOrderId());
        assertEquals(driverId, captor.getValue().getDriverUserId());
        assertEquals("ASSIGNED", captor.getValue().getStatus());
        assertEquals(managerId, captor.getValue().getAssignedByUserId());

        var historyCaptor = org.mockito.ArgumentCaptor.forClass(DeliveryStatusHistory.class);
        verify(deliveryHistoryRepository).save(historyCaptor.capture());
        assertEquals("ASSIGNED", historyCaptor.getValue().getStatus());
        verify(notificationRepository).save(any(AppNotification.class));
    }

    @Test
    void readyDeliveryOrderWaitsForAssignmentWhenNoDriverExists() {
        RestaurantSettings settings = new RestaurantSettings();
        settings.setRestaurantId(restaurantId);
        when(settingsRepository.findById(restaurantId)).thenReturn(Optional.of(settings));
        when(deliveryRepository.findByOrderId(orderId)).thenReturn(Optional.empty());
        when(memberRepository.findByRestaurantIdAndRoleOrderByCreatedAtAsc(
                restaurantId, RestaurantRole.DELIVERY_DRIVER))
                .thenReturn(List.of());
        when(deliveryRepository.save(any(Delivery.class))).thenAnswer(invocation -> {
            Delivery saved = invocation.getArgument(0);
            saved.setId(deliveryId);
            return saved;
        });

        service.ensureForReadyOrder(order("READY"), managerId);

        var captor = org.mockito.ArgumentCaptor.forClass(Delivery.class);
        verify(deliveryRepository).save(captor.capture());
        assertEquals("WAITING_ASSIGNMENT", captor.getValue().getStatus());
        assertNull(captor.getValue().getDriverUserId());
        verify(notificationRepository, never()).save(any(AppNotification.class));
    }

    @Test
    void driverPickupUpdatesDeliveryAndLinkedOrderInSameWorkflow() {
        Delivery delivery = delivery("ASSIGNED");
        Order order = order("READY");
        when(deliveryRepository.findById(deliveryId)).thenReturn(Optional.of(delivery));
        when(orderRepository.findByIdAndRestaurantIdForUpdate(orderId, restaurantId))
                .thenReturn(Optional.of(order));
        when(deliveryRepository.findByIdForUpdate(deliveryId)).thenReturn(Optional.of(delivery));

        var response = service.updateDeliveryStatus(
                restaurantId, deliveryId, driverId,
                new UpdateDeliveryStatusRequest("PICKED_UP", null, "Collected"));

        assertEquals("PICKED_UP", response.status());
        assertEquals("OUT_FOR_DELIVERY", order.getStatus());
        assertEquals("PICKED_UP", delivery.getStatus());
        assertNotNull(delivery.getPickedUpAt());
        verify(orderRepository).save(order);
        verify(orderHistoryRepository).save(any(OrderStatusHistory.class));
        verify(deliveryHistoryRepository).save(any(DeliveryStatusHistory.class));
        verify(authorization).requireDeliveryAccess(restaurantId, deliveryId);
    }

    @Test
    void deliveryCannotBeUpdatedThroughAnotherRestaurantsRoute() {
        Delivery delivery = delivery("ASSIGNED");
        when(deliveryRepository.findById(deliveryId)).thenReturn(Optional.of(delivery));
        when(orderRepository.findByIdAndRestaurantIdForUpdate(orderId, restaurantId))
                .thenReturn(Optional.empty());

        ApiException error = assertThrows(ApiException.class, () ->
                service.updateDeliveryStatus(
                        restaurantId, deliveryId, driverId,
                        new UpdateDeliveryStatusRequest("PICKED_UP", null, null)));

        assertEquals("DELIVERY_NOT_FOUND", error.getCode());
        verify(deliveryRepository, never()).findByIdForUpdate(any(UUID.class));
        verify(deliveryRepository, never()).save(any(Delivery.class));
    }

    @Test
    void failedDeliveryRequiresAReasonAndDoesNotChangeStateWithoutOne() {
        Delivery delivery = delivery("ASSIGNED");
        Order order = order("READY");
        when(deliveryRepository.findById(deliveryId)).thenReturn(Optional.of(delivery));
        when(orderRepository.findByIdAndRestaurantIdForUpdate(orderId, restaurantId))
                .thenReturn(Optional.of(order));
        when(deliveryRepository.findByIdForUpdate(deliveryId)).thenReturn(Optional.of(delivery));

        ApiException error = assertThrows(ApiException.class, () ->
                service.updateDeliveryStatus(
                        restaurantId, deliveryId, driverId,
                        new UpdateDeliveryStatusRequest("FAILED", "   ", null)));

        assertEquals("DELIVERY_FAILURE_REASON_REQUIRED", error.getCode());
        assertEquals("ASSIGNED", delivery.getStatus());
        verify(deliveryRepository, never()).save(any(Delivery.class));
    }

    @Test
    void defaultDriverCannotBeSetToNonDriverMembership() {
        when(memberRepository.findByRestaurantIdAndUserId(restaurantId, driverId))
                .thenReturn(Optional.of(memberWithRole(driverId, RestaurantRole.STAFF)));

        ApiException error = assertThrows(ApiException.class, () ->
                service.setDefaultDriver(restaurantId, managerId, driverId));

        assertEquals("INVALID_DELIVERY_DRIVER", error.getCode());
        verify(settingsRepository, never()).save(any(RestaurantSettings.class));
    }

    private RestaurantMember driver(UUID userId) {
        return memberWithRole(userId, RestaurantRole.DELIVERY_DRIVER);
    }

    private RestaurantMember memberWithRole(UUID userId, RestaurantRole role) {
        RestaurantMember member = new RestaurantMember();
        member.setRestaurantId(restaurantId);
        member.setUserId(userId);
        member.setRole(role);
        return member;
    }

    private Order order(String status) {
        Order order = new Order();
        order.setId(orderId);
        order.setRestaurantId(restaurantId);
        order.setOrderNumber("ORD-TEST-001");
        order.setOrderType("DELIVERY");
        order.setOrderChannel("CUSTOMER_APP");
        order.setStatus(status);
        order.setSubtotal(500L);
        order.setDeliveryFee(50L);
        order.setDiscountAmount(0L);
        order.setTotalAmount(550L);
        return order;
    }

    private Delivery delivery(String status) {
        Delivery delivery = new Delivery();
        delivery.setId(deliveryId);
        delivery.setOrderId(orderId);
        delivery.setDriverUserId(driverId);
        delivery.setStatus(status);
        return delivery;
    }
}
