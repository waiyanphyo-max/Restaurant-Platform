package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.notification.NotificationResponse;
import com.restaurant.platform.dto.order.QueueTrackingResponse;
import com.restaurant.platform.entity.AppNotification;
import com.restaurant.platform.entity.Order;
import com.restaurant.platform.entity.QueueTicket;
import com.restaurant.platform.repository.AppNotificationRepository;
import com.restaurant.platform.repository.OrderRepository;
import com.restaurant.platform.repository.QueueTicketRepository;
import com.restaurant.platform.security.TokenUtils;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class QueueTrackingServiceTest {

    private QueueTicketRepository ticketRepository;
    private OrderRepository orderRepository;
    private AppNotificationRepository notificationRepository;
    private QueueTrackingService service;

    private final UUID ticketId = UUID.randomUUID();
    private final UUID orderId = UUID.randomUUID();
    private final UUID notificationId = UUID.randomUUID();
    private final String token = TokenUtils.generateToken();

    @BeforeEach
    void setUp() {
        ticketRepository = mock(QueueTicketRepository.class);
        orderRepository = mock(OrderRepository.class);
        notificationRepository = mock(AppNotificationRepository.class);
        service = new QueueTrackingService(ticketRepository, orderRepository, notificationRepository);
    }

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void returnsQueueAndOrderStatusForValidTrackingToken() {
        QueueTicket ticket = ticket("WAITING");
        Order order = order("PREPARING");
        when(ticketRepository.findById(ticketId)).thenReturn(Optional.of(ticket));
        when(orderRepository.findByQueueTicketId(ticketId)).thenReturn(Optional.of(order));

        QueueTrackingResponse response = service.getStatus(ticketId, token);

        assertEquals(ticketId, response.ticketId());
        assertEquals(8, response.queueNumber());
        assertEquals("008", response.displayCode());
        assertEquals("WAITING", response.queueStatus());
        assertEquals("PREPARING", response.orderStatus());
    }

    @Test
    void invalidTokenUsesSameNotFoundResponseAsUnknownTicket() {
        when(ticketRepository.findById(ticketId)).thenReturn(Optional.of(ticket("WAITING")));

        ApiException exception = assertThrows(
                ApiException.class, () -> service.getStatus(ticketId, "wrong-token"));

        assertEquals(HttpStatus.NOT_FOUND, exception.getStatus());
        assertEquals("QUEUE_TICKET_NOT_FOUND", exception.getCode());
        verifyNoInteractions(orderRepository);
    }

    @Test
    void missingTokenDoesNotQueryTicket() {
        ApiException exception = assertThrows(
                ApiException.class, () -> service.getStatus(ticketId, null));

        assertEquals(HttpStatus.NOT_FOUND, exception.getStatus());
        verifyNoInteractions(ticketRepository, orderRepository);
    }

    @Test
    void returnsOnlyNotificationsAttachedToTheValidatedTicket() {
        QueueTicket ticket = ticket("READY");
        AppNotification notification = notification();
        when(ticketRepository.findById(ticketId)).thenReturn(Optional.of(ticket));
        when(notificationRepository.findByQueueTicketIdOrderByCreatedAtDesc(ticketId))
                .thenReturn(List.of(notification));

        List<NotificationResponse> responses = service.getNotifications(ticketId, token);

        assertEquals(1, responses.size());
        assertEquals(notificationId, responses.getFirst().id());
        assertEquals(ticketId, responses.getFirst().queueTicketId());
        assertEquals("QUEUE_READY", responses.getFirst().notificationType());
        verify(notificationRepository).findByQueueTicketIdOrderByCreatedAtDesc(ticketId);
    }

    @Test
    void marksOnlyNotificationBelongingToValidatedTicketAsRead() {
        QueueTicket ticket = ticket("READY");
        AppNotification notification = notification();
        when(ticketRepository.findById(ticketId)).thenReturn(Optional.of(ticket));
        when(notificationRepository.findByIdAndQueueTicketId(notificationId, ticketId))
                .thenReturn(Optional.of(notification));
        when(notificationRepository.save(notification)).thenReturn(notification);

        NotificationResponse response =
                service.markNotificationRead(ticketId, notificationId, token);

        assertEquals("READ", notification.getStatus());
        assertNotNull(notification.getReadAt());
        assertEquals("READ", response.status());
        verify(notificationRepository).findByIdAndQueueTicketId(notificationId, ticketId);
    }

    @Test
    void cannotMarkNotificationFromAnotherTicketAsRead() {
        QueueTicket ticket = ticket("READY");
        when(ticketRepository.findById(ticketId)).thenReturn(Optional.of(ticket));
        when(notificationRepository.findByIdAndQueueTicketId(notificationId, ticketId))
                .thenReturn(Optional.empty());

        ApiException exception = assertThrows(
                ApiException.class,
                () -> service.markNotificationRead(ticketId, notificationId, token));

        assertEquals(HttpStatus.NOT_FOUND, exception.getStatus());
        assertEquals("NOTIFICATION_NOT_FOUND", exception.getCode());
        verify(notificationRepository, never()).save(any());
    }

    private QueueTicket ticket(String status) {
        QueueTicket ticket = new QueueTicket();
        ticket.setId(ticketId);
        ticket.setRestaurantId(UUID.randomUUID());
        ticket.setDailyCounterId(UUID.randomUUID());
        ticket.setQueueNumber(8);
        ticket.setDisplayCode("008");
        ticket.setStatus(status);
        ticket.setPublicTokenHash(TokenUtils.sha256(token));
        ticket.setCreatedAt(OffsetDateTime.now());
        return ticket;
    }

    private Order order(String status) {
        Order order = new Order();
        order.setId(orderId);
        order.setRestaurantId(UUID.randomUUID());
        order.setOrderNumber("ORD-TEST-008");
        order.setOrderType("TAKEAWAY");
        order.setOrderChannel("COMMON_QR");
        order.setStatus(status);
        return order;
    }

    private AppNotification notification() {
        AppNotification notification = new AppNotification();
        notification.setId(notificationId);
        notification.setQueueTicketId(ticketId);
        notification.setOrderId(orderId);
        notification.setNotificationType("QUEUE_READY");
        notification.setTitle("Your order is ready");
        notification.setBody("Queue 008 is ready for collection.");
        notification.setChannel("IN_APP");
        notification.setStatus("PENDING");
        notification.setCreatedAt(OffsetDateTime.now());
        return notification;
    }
}
