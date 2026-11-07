package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.delivery.AssignDeliveryDriverRequest;
import com.restaurant.platform.dto.delivery.UpdateDeliveryStatusRequest;
import com.restaurant.platform.entity.AppNotification;
import com.restaurant.platform.entity.Delivery;
import com.restaurant.platform.entity.DeliveryStatusHistory;
import com.restaurant.platform.entity.Order;
import com.restaurant.platform.entity.OrderStatusHistory;
import com.restaurant.platform.entity.Payment;
import com.restaurant.platform.entity.RestaurantMember;
import com.restaurant.platform.entity.RestaurantSettings;
import com.restaurant.platform.repository.AppNotificationRepository;
import com.restaurant.platform.repository.DeliveryRepository;
import com.restaurant.platform.repository.DeliveryStatusHistoryRepository;
import com.restaurant.platform.repository.OrderRepository;
import com.restaurant.platform.repository.OrderStatusHistoryRepository;
import com.restaurant.platform.repository.PaymentRepository;
import com.restaurant.platform.repository.RestaurantMemberRepository;
import com.restaurant.platform.repository.RestaurantSettingsRepository;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.security.RestaurantPermission;
import com.restaurant.platform.security.RestaurantRole;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import java.time.OffsetDateTime;
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
    private PaymentRepository paymentRepository;
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
        paymentRepository = mock(PaymentRepository.class);
        settingsRepository = mock(RestaurantSettingsRepository.class);
        memberRepository = mock(RestaurantMemberRepository.class);
        notificationRepository = mock(AppNotificationRepository.class);
        authorization = mock(RestaurantAuthorization.class);
        service = deliveryService(authorization);
    }

    private DeliveryService deliveryService(RestaurantAuthorization authorization) {
        return new DeliveryService(
                deliveryRepository,
                deliveryHistoryRepository,
                orderRepository,
                orderHistoryRepository,
                paymentRepository,
                settingsRepository,
                memberRepository,
                notificationRepository,
                authorization);
    }

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void readyDeliveryOrderUsesAndPersistsEarliestDriverAsDefault() {
        RestaurantSettings settings = new RestaurantSettings();
        settings.setRestaurantId(restaurantId);
        when(settingsRepository.findById(restaurantId)).thenReturn(Optional.of(settings));
        when(deliveryRepository.findByOrderId(orderId)).thenReturn(Optional.empty());
        when(memberRepository.findEligibleDeliveryDrivers(restaurantId))
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
        when(memberRepository.findEligibleDeliveryDrivers(restaurantId))
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
        when(deliveryRepository.findOrderIdByDeliveryIdAndRestaurantId(deliveryId, restaurantId))
                .thenReturn(Optional.of(orderId));
        when(orderRepository.findByIdAndRestaurantIdForUpdate(orderId, restaurantId))
                .thenReturn(Optional.of(order));
        when(deliveryRepository.findByIdForUpdate(deliveryId)).thenReturn(Optional.of(delivery));

        var response = service.updateDeliveryStatus(
                restaurantId, deliveryId, driverId,
                new UpdateDeliveryStatusRequest("PICKED_UP", null, "Collected", null));

        assertEquals("PICKED_UP", response.status());
        assertEquals("OUT_FOR_DELIVERY", order.getStatus());
        assertEquals("PICKED_UP", delivery.getStatus());
        assertNotNull(delivery.getPickedUpAt());
        verify(orderRepository).save(order);
        verify(orderHistoryRepository).save(any(OrderStatusHistory.class));
        verify(deliveryRepository).saveAndFlush(delivery);
        verify(deliveryHistoryRepository).save(any(DeliveryStatusHistory.class));
    }

    @Test
    void deliveryCannotBeUpdatedThroughAnotherRestaurantsRoute() {
        when(deliveryRepository.findOrderIdByDeliveryIdAndRestaurantId(deliveryId, restaurantId))
                .thenReturn(Optional.empty());

        ApiException error = assertThrows(ApiException.class, () ->
                service.updateDeliveryStatus(
                        restaurantId, deliveryId, driverId,
                        new UpdateDeliveryStatusRequest("PICKED_UP", null, null, null)));

        assertEquals("DELIVERY_NOT_FOUND", error.getCode());
        verifyNoInteractions(orderRepository);
        verify(deliveryRepository, never()).findByIdForUpdate(any(UUID.class));
        verify(deliveryRepository, never()).saveAndFlush(any(Delivery.class));
    }

    @Test
    void failedDeliveryRequiresAReasonAndDoesNotChangeStateWithoutOne() {
        Delivery delivery = delivery("ASSIGNED");
        Order order = order("READY");
        when(deliveryRepository.findOrderIdByDeliveryIdAndRestaurantId(deliveryId, restaurantId))
                .thenReturn(Optional.of(orderId));
        when(orderRepository.findByIdAndRestaurantIdForUpdate(orderId, restaurantId))
                .thenReturn(Optional.of(order));
        when(deliveryRepository.findByIdForUpdate(deliveryId)).thenReturn(Optional.of(delivery));

        ApiException error = assertThrows(ApiException.class, () ->
                service.updateDeliveryStatus(
                        restaurantId, deliveryId, driverId,
                        new UpdateDeliveryStatusRequest("FAILED", "   ", null, null)));

        assertEquals("DELIVERY_FAILURE_REASON_REQUIRED", error.getCode());
        assertEquals("ASSIGNED", delivery.getStatus());
        verify(deliveryRepository, never()).saveAndFlush(any(Delivery.class));
    }

    @Test
    void cashOnDeliveryCannotBeMarkedDeliveredWithoutCashConfirmation() {
        Delivery delivery = delivery("PICKED_UP");
        Order order = order("OUT_FOR_DELIVERY");
        Payment payment = cashOnDeliveryPayment();
        when(deliveryRepository.findOrderIdByDeliveryIdAndRestaurantId(deliveryId, restaurantId))
                .thenReturn(Optional.of(orderId));
        when(orderRepository.findByIdAndRestaurantIdForUpdate(orderId, restaurantId))
                .thenReturn(Optional.of(order));
        when(deliveryRepository.findByIdForUpdate(deliveryId)).thenReturn(Optional.of(delivery));
        when(paymentRepository.findByOrderIdOrderByCreatedAtDesc(orderId))
                .thenReturn(List.of(payment));

        ApiException error = assertThrows(ApiException.class, () ->
                service.updateDeliveryStatus(restaurantId, deliveryId, driverId,
                        new UpdateDeliveryStatusRequest("DELIVERED", null, "Left at door", false)));

        assertEquals("CASH_COLLECTION_REQUIRED", error.getCode());
        assertEquals("PICKED_UP", delivery.getStatus());
        assertEquals("OUT_FOR_DELIVERY", order.getStatus());
        assertEquals("PENDING", payment.getStatus());
        verify(deliveryRepository, never()).saveAndFlush(any(Delivery.class));
        verify(paymentRepository, never()).save(any(Payment.class));
    }

    @Test
    void cashOnDeliveryIsMarkedPaidWhenDriverConfirmsCollection() {
        Delivery delivery = delivery("PICKED_UP");
        Order order = order("OUT_FOR_DELIVERY");
        Payment payment = cashOnDeliveryPayment();
        when(deliveryRepository.findOrderIdByDeliveryIdAndRestaurantId(deliveryId, restaurantId))
                .thenReturn(Optional.of(orderId));
        when(orderRepository.findByIdAndRestaurantIdForUpdate(orderId, restaurantId))
                .thenReturn(Optional.of(order));
        when(deliveryRepository.findByIdForUpdate(deliveryId)).thenReturn(Optional.of(delivery));
        when(paymentRepository.findByOrderIdOrderByCreatedAtDesc(orderId))
                .thenReturn(List.of(payment));
        when(paymentRepository.save(any(Payment.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        var response = service.updateDeliveryStatus(
                restaurantId, deliveryId, driverId,
                new UpdateDeliveryStatusRequest("DELIVERED", null, "Cash received", true));

        assertEquals("DELIVERED", response.status());
        assertEquals("COMPLETED", order.getStatus());
        assertEquals("DELIVERED", delivery.getStatus());
        assertEquals("PAID", payment.getStatus());
        assertNotNull(payment.getPaidAt());
        verify(paymentRepository).save(payment);
    }

    @Test
    void managerCannotBypassPendingCashOnDeliveryConfirmation() {
        Order order = order("OUT_FOR_DELIVERY");
        Delivery delivery = delivery("PICKED_UP");
        when(deliveryRepository.findByOrderIdForUpdate(orderId)).thenReturn(Optional.of(delivery));
        when(paymentRepository.findByOrderIdOrderByCreatedAtDesc(orderId))
                .thenReturn(List.of(cashOnDeliveryPayment()));
        var managerService = authenticatedService(managerId, RestaurantRole.MANAGER);

        ApiException error = assertThrows(ApiException.class, () ->
                managerService.synchronizeManagerOrderStatus(order, managerId, "COMPLETED"));

        assertEquals("CASH_COLLECTION_REQUIRED", error.getCode());
        assertEquals("PICKED_UP", delivery.getStatus());
        verify(deliveryRepository, never()).saveAndFlush(any(Delivery.class));
    }

    private Payment cashOnDeliveryPayment() {
        Payment payment = new Payment();
        payment.setId(UUID.randomUUID());
        payment.setOrderId(orderId);
        payment.setMethod("CASH_ON_DELIVERY");
        payment.setStatus("PENDING");
        payment.setAmount(550L);
        return payment;
    }

    @Test
    void defaultDriverCannotBeSetToNonDriverMembership() {
        when(memberRepository.findEligibleDeliveryDrivers(restaurantId)).thenReturn(List.of());

        ApiException error = assertThrows(ApiException.class, () ->
                service.setDefaultDriver(restaurantId, managerId, driverId));

        assertEquals("INVALID_DELIVERY_DRIVER", error.getCode());
        verify(settingsRepository, never()).save(any(RestaurantSettings.class));
    }

    @ParameterizedTest
    @EnumSource(RestaurantRole.class)
    void managerCanAssignEveryEligibleMembershipRoleIncludingSelf(RestaurantRole targetRole) {
        Delivery delivery = delivery("WAITING_ASSIGNMENT");
        when(deliveryRepository.findOrderIdByDeliveryIdAndRestaurantId(deliveryId, restaurantId))
                .thenReturn(Optional.of(orderId));
        when(deliveryRepository.findByIdForUpdate(deliveryId)).thenReturn(Optional.of(delivery));
        when(orderRepository.findByIdAndRestaurantIdForUpdate(orderId, restaurantId)).thenReturn(Optional.of(order("READY")));
        UUID assignee = targetRole == RestaurantRole.MANAGER ? managerId : UUID.randomUUID();
        when(memberRepository.findEligibleDeliveryMemberForUpdate(restaurantId, assignee))
                .thenReturn(Optional.of(memberWithRole(assignee, targetRole)));

        var result = authenticatedService(managerId, RestaurantRole.MANAGER).assignDriver(
                restaurantId, deliveryId, managerId, new AssignDeliveryDriverRequest(assignee, null));

        assertEquals(assignee, result.driverUserId());
        assertEquals("ASSIGNED", result.status());
        assertEquals(managerId, delivery.getAssignedByUserId());
    }

    @Test
    void managerCannotAssignAnIneligibleOrForeignMember() {
        Delivery delivery = delivery("WAITING_ASSIGNMENT");
        when(deliveryRepository.findOrderIdByDeliveryIdAndRestaurantId(deliveryId, restaurantId))
                .thenReturn(Optional.of(orderId));
        when(deliveryRepository.findByIdForUpdate(deliveryId)).thenReturn(Optional.of(delivery));
        when(orderRepository.findByIdAndRestaurantIdForUpdate(orderId, restaurantId)).thenReturn(Optional.of(order("READY")));
        var managerService = authenticatedService(managerId, RestaurantRole.MANAGER);

        var error = assertThrows(ApiException.class, () -> managerService.assignDriver(
                restaurantId, deliveryId, managerId, new AssignDeliveryDriverRequest(UUID.randomUUID(), null)));

        assertEquals("INVALID_DELIVERY_DRIVER", error.getCode());
        verify(deliveryRepository, never()).saveAndFlush(any());
    }

    @Test
    void managerCanReassignCancelledDeliveryWhileItsOrderIsReady() {
        Delivery delivery = delivery("ASSIGNED");
        Order order = order("READY");
        lockedDelivery(delivery, order);
        var managerService = authenticatedService(managerId, RestaurantRole.MANAGER);
        assertEquals("CANCELLED", managerService.updateDeliveryStatus(restaurantId, deliveryId, managerId,
                new UpdateDeliveryStatusRequest("CANCELLED", null, null, null)).status());

        when(memberRepository.findEligibleDeliveryMemberForUpdate(restaurantId, managerId))
                .thenReturn(Optional.of(memberWithRole(managerId, RestaurantRole.MANAGER)));
        var reassigned = managerService.assignDriver(restaurantId, deliveryId, managerId,
                new AssignDeliveryDriverRequest(managerId, null));

        assertEquals("ASSIGNED", reassigned.status());
        assertEquals(managerId, reassigned.driverUserId());
        assertEquals("READY", order.getStatus());
        verify(deliveryHistoryRepository).save(argThat(history -> "CANCELLED".equals(history.getStatus())));
        verify(deliveryHistoryRepository).save(argThat(history -> "ASSIGNED".equals(history.getStatus())
                && history.getNote().contains(driverId.toString()) && history.getNote().contains(managerId.toString())));
        verifyNoInteractions(paymentRepository, orderHistoryRepository);
    }

    @Test
    void managerCannotReassignCancelledDeliveryWhenItsOrderIsNoLongerReady() {
        Delivery delivery = delivery("CANCELLED");
        lockedDelivery(delivery, order("CANCELLED"));
        var managerService = authenticatedService(managerId, RestaurantRole.MANAGER);

        var error = assertThrows(ApiException.class, () -> managerService.assignDriver(
                restaurantId, deliveryId, managerId, new AssignDeliveryDriverRequest(managerId, null)));

        assertEquals("DELIVERY_CANNOT_BE_REASSIGNED", error.getCode());
        verify(deliveryRepository, never()).saveAndFlush(any());
        verifyNoInteractions(deliveryHistoryRepository, paymentRepository);
    }

    @ParameterizedTest
    @EnumSource(RestaurantRole.class)
    void restaurantDeliveryListUsesAssignedScopeForOperationalRoles(RestaurantRole role) {
        var scopedService = authenticatedService(managerId, role);
        var pageable = PageRequest.of(0, 20);
        when(deliveryRepository.findPageByRestaurantIdAndOptionalStatus(eq(restaurantId), isNull(), any()))
                .thenReturn(Page.empty(pageable));
        when(deliveryRepository.findPageByDriverAndRestaurantIdAndOptionalStatus(eq(restaurantId), eq(managerId), isNull(), any()))
                .thenReturn(Page.empty(pageable));

        scopedService.listRestaurantDeliveries(restaurantId, null, pageable);

        if (role.allows(RestaurantPermission.DELIVERY_ASSIGN)) {
            verify(deliveryRepository).findPageByRestaurantIdAndOptionalStatus(eq(restaurantId), isNull(), any());
            verify(deliveryRepository, never()).findPageByDriverAndRestaurantIdAndOptionalStatus(any(), any(), any(), any());
        } else {
            verify(deliveryRepository).findPageByDriverAndRestaurantIdAndOptionalStatus(eq(restaurantId), eq(managerId), isNull(), any());
            verify(deliveryRepository, never()).findPageByRestaurantIdAndOptionalStatus(any(), any(), any());
        }
    }

    @Test
    void staffCannotUseEitherStatusWorkflowForAnotherMembersDelivery() {
        Delivery delivery = delivery("ASSIGNED");
        Order order = order("READY");
        when(deliveryRepository.findOrderIdByDeliveryIdAndRestaurantId(deliveryId, restaurantId))
                .thenReturn(Optional.of(orderId));
        when(deliveryRepository.findByOrderIdForUpdate(orderId)).thenReturn(Optional.of(delivery));
        when(deliveryRepository.findByIdForUpdate(deliveryId)).thenReturn(Optional.of(delivery));
        when(orderRepository.findByIdAndRestaurantIdForUpdate(orderId, restaurantId)).thenReturn(Optional.of(order));
        var staffService = authenticatedService(managerId, RestaurantRole.STAFF);

        var deliveryError = assertThrows(ApiException.class, () -> staffService.updateDeliveryStatus(
                restaurantId, deliveryId, managerId, new UpdateDeliveryStatusRequest("PICKED_UP", null, null, null)));
        var orderError = assertThrows(ApiException.class, () -> staffService.synchronizeManagerOrderStatus(
                order, managerId, "OUT_FOR_DELIVERY"));

        assertEquals("DELIVERY_NOT_FOUND", deliveryError.getCode());
        assertEquals("DELIVERY_NOT_FOUND", orderError.getCode());
        assertEquals("READY", order.getStatus());
        assertEquals("ASSIGNED", delivery.getStatus());
        verifyNoInteractions(deliveryHistoryRepository, orderHistoryRepository, paymentRepository);
        verify(deliveryRepository, never()).saveAndFlush(any());
    }

    @Test
    void ownerCanSelfAssignAndAnExactAssignmentReplayKeepsOneAuditEvent() {
        Delivery delivery = delivery("WAITING_ASSIGNMENT");
        delivery.setDriverUserId(null);
        lockedDelivery(delivery, order("READY"));
        when(memberRepository.findEligibleDeliveryMemberForUpdate(restaurantId, managerId))
                .thenReturn(Optional.of(memberWithRole(managerId, RestaurantRole.OWNER)));
        var ownerService = authenticatedService(managerId, RestaurantRole.OWNER);
        var request = new AssignDeliveryDriverRequest(managerId, "Owner is delivering");

        assertEquals(managerId, ownerService.assignDriver(restaurantId, deliveryId, managerId, request).driverUserId());
        var assignedAt = delivery.getAssignedAt();
        assertEquals(assignedAt, ownerService.assignDriver(restaurantId, deliveryId, managerId, request).assignedAt());

        verify(deliveryRepository, times(1)).saveAndFlush(delivery);
        verify(deliveryHistoryRepository, times(1)).save(any());
        verify(notificationRepository, times(1)).save(any());
    }

    @ParameterizedTest
    @EnumSource(value = RestaurantRole.class, names = {"STAFF", "DELIVERY_DRIVER"})
    void assignedWorkerCanPickUpOnceAndCannotUpdateUsingAnOlderRevision(RestaurantRole role) {
        Delivery delivery = delivery("ASSIGNED");
        var revision = OffsetDateTime.parse("2026-11-04T09:15:42.321879+07:00");
        delivery.setUpdatedAt(revision);
        Order order = order("READY");
        lockedDelivery(delivery, order);
        var workerService = authenticatedService(driverId, role);

        ApiException stale = assertThrows(ApiException.class, () -> workerService.updateDeliveryStatus(
                restaurantId, deliveryId, driverId,
                new UpdateDeliveryStatusRequest("PICKED_UP", null, null, null, revision.minusSeconds(1))));
        assertEquals("STALE_DELIVERY", stale.getCode());

        var request = new UpdateDeliveryStatusRequest("PICKED_UP", null, "Packed upright", null,
                revision.withOffsetSameInstant(java.time.ZoneOffset.UTC));
        assertEquals("PICKED_UP", workerService.updateDeliveryStatus(restaurantId, deliveryId, driverId, request).status());
        ApiException repeat = assertThrows(ApiException.class, () -> workerService.updateDeliveryStatus(
                restaurantId, deliveryId, driverId, request));
        assertEquals("INVALID_DELIVERY_STATUS_TRANSITION", repeat.getCode());

        verify(deliveryRepository, times(1)).saveAndFlush(delivery);
        verify(deliveryHistoryRepository, times(1)).save(argThat(history -> "Packed upright".equals(history.getNote())));
    }

    @Test
    void reassignmentRetainsFailureReasonAndNoteInHistoryAndRevokesPriorAccess() {
        Delivery delivery = delivery("PICKED_UP");
        Order order = order("OUT_FOR_DELIVERY");
        lockedDelivery(delivery, order);
        var workerService = authenticatedService(driverId, RestaurantRole.DELIVERY_DRIVER);
        workerService.updateDeliveryStatus(restaurantId, deliveryId, driverId,
                new UpdateDeliveryStatusRequest("FAILED", "Customer unavailable", "Called twice", null));

        UUID replacement = UUID.randomUUID();
        when(memberRepository.findEligibleDeliveryMemberForUpdate(restaurantId, replacement))
                .thenReturn(Optional.of(memberWithRole(replacement, RestaurantRole.STAFF)));
        var managerService = authenticatedService(managerId, RestaurantRole.MANAGER);
        managerService.assignDriver(restaurantId, deliveryId, managerId, new AssignDeliveryDriverRequest(replacement, null));
        assertEquals("READY", order.getStatus());
        assertNull(delivery.getFailureReason());

        authenticatedService(driverId, RestaurantRole.DELIVERY_DRIVER);
        ApiException revoked = assertThrows(ApiException.class, () -> workerService.updateDeliveryStatus(
                restaurantId, deliveryId, driverId, new UpdateDeliveryStatusRequest("PICKED_UP", null, null, null)));
        assertEquals("DELIVERY_NOT_FOUND", revoked.getCode());

        var history = org.mockito.ArgumentCaptor.forClass(DeliveryStatusHistory.class);
        verify(deliveryHistoryRepository, times(2)).save(history.capture());
        assertEquals("Failure reason: Customer unavailable\nCalled twice", history.getAllValues().getFirst().getNote());
        assertTrue(history.getAllValues().getLast().getNote().contains(driverId.toString()));
        assertTrue(history.getAllValues().getLast().getNote().contains(replacement.toString()));
        verify(notificationRepository).save(argThat(notification -> driverId.equals(notification.getUserId())
                && "DELIVERY_REASSIGNED".equals(notification.getNotificationType())));
    }

    private void lockedDelivery(Delivery delivery, Order order) {
        when(deliveryRepository.findOrderIdByDeliveryIdAndRestaurantId(deliveryId, restaurantId))
                .thenReturn(Optional.of(orderId));
        when(orderRepository.findByIdAndRestaurantIdForUpdate(orderId, restaurantId)).thenReturn(Optional.of(order));
        when(deliveryRepository.findByIdForUpdate(deliveryId)).thenReturn(Optional.of(delivery));
    }

    private DeliveryService authenticatedService(UUID subject, RestaurantRole role) {
        var token = Jwt.withTokenValue("verified-delivery-test-token").header("alg", "ES256").subject(subject.toString()).build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(token, List.of()));
        when(memberRepository.findByRestaurantIdAndUserId(restaurantId, subject))
                .thenReturn(Optional.of(memberWithRole(subject, role)));
        return deliveryService(new RestaurantAuthorization(memberRepository, deliveryRepository));
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
