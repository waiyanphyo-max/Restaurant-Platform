package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.order.ManagerOrderDetailDto;
import com.restaurant.platform.dto.order.OrderSummaryDto;
import com.restaurant.platform.dto.order.UpdateOrderStatusRequest;
import com.restaurant.platform.entity.Order;
import com.restaurant.platform.entity.OrderItem;
import com.restaurant.platform.entity.OrderItemModifier;
import com.restaurant.platform.entity.OrderStatusHistory;
import com.restaurant.platform.repository.AppNotificationRepository;
import com.restaurant.platform.repository.OrderItemModifierRepository;
import com.restaurant.platform.repository.OrderItemRepository;
import com.restaurant.platform.repository.OrderRepository;
import com.restaurant.platform.repository.OrderStatusHistoryRepository;
import com.restaurant.platform.repository.QueueTicketRepository;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.security.RestaurantPermission;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ManagerOrderServiceTest {

    private OrderRepository orderRepository;
    private OrderItemRepository orderItemRepository;
    private OrderItemModifierRepository orderItemModifierRepository;
    private OrderStatusHistoryRepository historyRepository;
    private QueueTicketRepository queueTicketRepository;
    private AppNotificationRepository notificationRepository;
    private RestaurantAuthorization authorization;
    private ManagerOrderService service;

    private final UUID restaurantId = UUID.randomUUID();
    private final UUID userId = UUID.randomUUID();
    private final UUID orderId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        orderRepository = mock(OrderRepository.class);
        orderItemRepository = mock(OrderItemRepository.class);
        orderItemModifierRepository = mock(OrderItemModifierRepository.class);
        historyRepository = mock(OrderStatusHistoryRepository.class);
        queueTicketRepository = mock(QueueTicketRepository.class);
        notificationRepository = mock(AppNotificationRepository.class);
        authorization = mock(RestaurantAuthorization.class);
        service = new ManagerOrderService(
                orderRepository,
                orderItemRepository,
                orderItemModifierRepository,
                historyRepository,
                queueTicketRepository,
                notificationRepository,
                authorization);
    }

    @Test
    void listOrdersScopesByRestaurantAndStatusAndCapsPageSize() {
        Order order = order("PENDING", "DINE_IN");
        when(orderRepository.findByRestaurantIdAndStatus(
                eq(restaurantId), eq("PENDING"), any()))
                .thenReturn(new PageImpl<>(List.of(order)));

        var page = service.listOrders(
                restaurantId,
                userId,
                "PENDING",
                PageRequest.of(0, 500, Sort.by(Sort.Direction.DESC, "createdAt")));

        assertEquals(1, page.getTotalElements());
        assertEquals(orderId, page.getContent().getFirst().id());
        ArgumentCaptor<org.springframework.data.domain.Pageable> pageable =
                ArgumentCaptor.forClass(org.springframework.data.domain.Pageable.class);
        verify(orderRepository).findByRestaurantIdAndStatus(
                eq(restaurantId), eq("PENDING"), pageable.capture());
        assertEquals(100, pageable.getValue().getPageSize());
        verify(authorization).requireAuthenticatedUserMatches(userId);
        verify(authorization).requirePermission(restaurantId, RestaurantPermission.ORDER_READ);
    }

    @Test
    void listOrdersIgnoresUnsupportedSortProperty() {
        when(orderRepository.findByRestaurantId(eq(restaurantId), any()))
                .thenReturn(new PageImpl<>(List.of()));

        service.listOrders(
                restaurantId, userId, null,
                PageRequest.of(0, 20, Sort.by(Sort.Direction.ASC, "secretInternalProperty")));

        ArgumentCaptor<org.springframework.data.domain.Pageable> pageable =
                ArgumentCaptor.forClass(org.springframework.data.domain.Pageable.class);
        verify(orderRepository).findByRestaurantId(eq(restaurantId), pageable.capture());
        assertEquals("createdAt", pageable.getValue().getSort().getOrderFor("createdAt").getProperty());
        assertEquals(Sort.Direction.DESC, pageable.getValue().getSort().getOrderFor("createdAt").getDirection());
        assertNull(pageable.getValue().getSort().getOrderFor("secretInternalProperty"));
    }

    @Test
    void listOrdersRejectsUnknownStatusFilter() {
        ApiException exception = assertThrows(
                ApiException.class,
                () -> service.listOrders(restaurantId, userId, "NOT_A_STATUS", PageRequest.of(0, 20)));

        assertEquals(HttpStatus.BAD_REQUEST, exception.getStatus());
        assertEquals("INVALID_ORDER_STATUS_FILTER", exception.getCode());
        verifyNoInteractions(orderRepository);
    }

    @Test
    void orderDetailReturnsItemsModifiersAndStatusHistory() {
        Order order = order("PREPARING", "DINE_IN");
        UUID itemId = UUID.randomUUID();
        UUID modifierId = UUID.randomUUID();
        UUID modifierOptionId = UUID.randomUUID();

        OrderItem item = new OrderItem();
        item.setId(itemId);
        item.setRestaurantId(restaurantId);
        item.setOrderId(orderId);
        item.setProductId(UUID.randomUUID());
        item.setProductName("Tea");
        item.setUnitPrice(1200L);
        item.setQuantity(2);
        item.setSubtotal(2400L);

        OrderItemModifier modifier = new OrderItemModifier();
        modifier.setId(modifierId);
        modifier.setRestaurantId(restaurantId);
        modifier.setOrderItemId(itemId);
        modifier.setModifierOptionId(modifierOptionId);
        modifier.setName("Less sugar");
        modifier.setAdditionalPrice(0L);
        modifier.setQuantity(1);

        OrderStatusHistory history = new OrderStatusHistory();
        history.setId(UUID.randomUUID());
        history.setOrderId(orderId);
        history.setStatus("PREPARING");
        history.setChangedByUserId(userId);
        history.setNote("Started preparation");
        history.setCreatedAt(OffsetDateTime.now());

        when(orderRepository.findByIdAndRestaurantId(orderId, restaurantId))
                .thenReturn(Optional.of(order));
        when(orderItemRepository.findByOrderIdAndRestaurantIdOrderByCreatedAtAsc(orderId, restaurantId))
                .thenReturn(List.of(item));
        when(orderItemModifierRepository.findByOrderItemIdInAndRestaurantIdOrderByIdAsc(
                List.of(itemId), restaurantId))
                .thenReturn(List.of(modifier));
        when(historyRepository.findByOrderIdOrderByCreatedAtAsc(orderId))
                .thenReturn(List.of(history));

        ManagerOrderDetailDto detail = service.getOrderDetail(restaurantId, orderId);

        assertEquals(orderId, detail.id());
        assertEquals(restaurantId, detail.restaurantId());
        assertEquals(1, detail.items().size());
        assertEquals("Tea", detail.items().getFirst().productName());
        assertEquals(1, detail.items().getFirst().modifiers().size());
        assertEquals("Less sugar", detail.items().getFirst().modifiers().getFirst().name());
        assertEquals("PREPARING", detail.statusHistory().getFirst().status());
        verify(authorization).requirePermission(restaurantId, RestaurantPermission.ORDER_READ);
    }

    @Test
    void orderDetailReturnsNotFoundForOrderOutsideRestaurant() {
        when(orderRepository.findByIdAndRestaurantId(orderId, restaurantId))
                .thenReturn(Optional.empty());

        ApiException exception = assertThrows(
                ApiException.class, () -> service.getOrderDetail(restaurantId, orderId));

        assertEquals(HttpStatus.NOT_FOUND, exception.getStatus());
        assertEquals("ORDER_NOT_FOUND", exception.getCode());
        verifyNoInteractions(orderItemRepository, orderItemModifierRepository, historyRepository);
    }

    @Test
    void updateStatusLocksRestaurantScopedOrderAndRecordsAuthenticatedActor() {
        Order order = order("PENDING", "DINE_IN");
        when(orderRepository.findByIdAndRestaurantIdForUpdate(orderId, restaurantId))
                .thenReturn(Optional.of(order));

        OrderSummaryDto response = service.updateStatus(
                restaurantId,
                orderId,
                userId,
                new UpdateOrderStatusRequest("ACCEPTED", "Accepted by staff"));

        assertEquals("ACCEPTED", response.status());
        verify(orderRepository).findByIdAndRestaurantIdForUpdate(orderId, restaurantId);
        verify(orderRepository).save(order);
        ArgumentCaptor<OrderStatusHistory> history = ArgumentCaptor.forClass(OrderStatusHistory.class);
        verify(historyRepository).save(history.capture());
        assertEquals(userId, history.getValue().getChangedByUserId());
        assertEquals("ACCEPTED", history.getValue().getStatus());
        assertEquals("Accepted by staff", history.getValue().getNote());
    }

    @Test
    void movingQueueOrderToReadyUpdatesTicketAndCreatesInAppNotification() {
        Order order = order("PREPARING", "TAKEAWAY");
        UUID customerId = UUID.randomUUID();
        order.setCustomerId(customerId);
        UUID ticketId = UUID.randomUUID();
        order.setQueueTicketId(ticketId);

        com.restaurant.platform.entity.QueueTicket ticket =
                new com.restaurant.platform.entity.QueueTicket();
        ticket.setId(ticketId);
        ticket.setRestaurantId(restaurantId);
        ticket.setDisplayCode("Q-008");
        ticket.setStatus("WAITING");

        when(orderRepository.findByIdAndRestaurantIdForUpdate(orderId, restaurantId))
                .thenReturn(Optional.of(order));
        when(queueTicketRepository.findById(ticketId)).thenReturn(Optional.of(ticket));

        OrderSummaryDto response = service.updateStatus(
                restaurantId, orderId, userId,
                new UpdateOrderStatusRequest("READY", "Ready for collection"));

        assertEquals("READY", response.status());
        assertEquals("READY", ticket.getStatus());
        assertNotNull(ticket.getReadyAt());
        verify(queueTicketRepository).save(ticket);
        ArgumentCaptor<com.restaurant.platform.entity.AppNotification> notification =
                ArgumentCaptor.forClass(com.restaurant.platform.entity.AppNotification.class);
        verify(notificationRepository).save(notification.capture());
        assertEquals(orderId, notification.getValue().getOrderId());
        assertEquals(ticketId, notification.getValue().getQueueTicketId());
        assertEquals("QUEUE_READY", notification.getValue().getNotificationType());
        assertEquals("IN_APP", notification.getValue().getChannel());
        assertEquals(customerId, notification.getValue().getUserId());
    }

    @Test
    void cancellationRequiresSeparateCancellationPermission() {
        Order order = order("PENDING", "DINE_IN");
        when(orderRepository.findByIdAndRestaurantIdForUpdate(orderId, restaurantId))
                .thenReturn(Optional.of(order));

        service.updateStatus(restaurantId, orderId, userId,
                new UpdateOrderStatusRequest("CANCELLED", "Customer cancelled"));

        verify(authorization).requirePermission(restaurantId, RestaurantPermission.ORDER_CANCEL);
    }

    @Test
    void updateStatusRejectsCrossRestaurantOrderAndDoesNotWriteHistory() {
        when(orderRepository.findByIdAndRestaurantIdForUpdate(orderId, restaurantId))
                .thenReturn(Optional.empty());

        ApiException exception = assertThrows(
                ApiException.class,
                () -> service.updateStatus(restaurantId, orderId, userId,
                        new UpdateOrderStatusRequest("ACCEPTED", null)));

        assertEquals(HttpStatus.NOT_FOUND, exception.getStatus());
        assertEquals("ORDER_NOT_FOUND", exception.getCode());
        verify(orderRepository, never()).save(any());
        verifyNoInteractions(historyRepository);
    }

    @Test
    void updateStatusRejectsInvalidTransitionAndDoesNotWriteHistory() {
        Order order = order("COMPLETED", "DINE_IN");
        when(orderRepository.findByIdAndRestaurantIdForUpdate(orderId, restaurantId))
                .thenReturn(Optional.of(order));

        ApiException exception = assertThrows(
                ApiException.class,
                () -> service.updateStatus(restaurantId, orderId, userId,
                        new UpdateOrderStatusRequest("ACCEPTED", null)));

        assertEquals(HttpStatus.CONFLICT, exception.getStatus());
        assertEquals("INVALID_ORDER_STATUS_TRANSITION", exception.getCode());
        verify(orderRepository, never()).save(any());
        verifyNoInteractions(historyRepository);
    }

    private Order order(String status, String type) {
        Order order = new Order();
        order.setId(orderId);
        order.setRestaurantId(restaurantId);
        order.setOrderNumber("ORD-TEST");
        order.setOrderType(type);
        order.setOrderChannel("COMMON_QR");
        order.setStatus(status);
        order.setSubtotal(2400L);
        order.setDeliveryFee(0L);
        order.setDiscountAmount(0L);
        order.setTotalAmount(2400L);
        order.setCreatedAt(OffsetDateTime.now());
        order.setUpdatedAt(OffsetDateTime.now());
        return order;
    }
}
