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

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class QueueTrackingService {

    private final QueueTicketRepository queueTicketRepository;
    private final OrderRepository orderRepository;
    private final AppNotificationRepository notificationRepository;

    @Transactional(readOnly = true)
    public QueueTrackingResponse getStatus(UUID ticketId, String rawToken) {
        QueueTicket ticket = requireTicketWithValidToken(ticketId, rawToken);

        Order order = orderRepository
                .findByQueueTicketId(ticket.getId())
                .orElseThrow(this::queueTicketNotFound);

        return new QueueTrackingResponse(
                ticket.getId(),
                ticket.getQueueNumber(),
                ticket.getDisplayCode(),
                ticket.getStatus(),
                order.getOrderNumber(),
                order.getStatus(),
                ticket.getCreatedAt(),
                ticket.getReadyAt(),
                ticket.getCompletedAt());
    }

    @Transactional(readOnly = true)
    public List<NotificationResponse> getNotifications(UUID ticketId, String rawToken) {
        QueueTicket ticket = requireTicketWithValidToken(ticketId, rawToken);

        return notificationRepository
                .findByQueueTicketIdOrderByCreatedAtDesc(ticket.getId())
                .stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public NotificationResponse markNotificationRead(
            UUID ticketId,
            UUID notificationId,
            String rawToken) {
        QueueTicket ticket = requireTicketWithValidToken(ticketId, rawToken);

        AppNotification notification = notificationRepository
                .findByIdAndQueueTicketId(notificationId, ticket.getId())
                .orElseThrow(this::notificationNotFound);

        if (!"READ".equals(notification.getStatus())) {
            notification.setStatus("READ");
            notification.setReadAt(OffsetDateTime.now(ZoneOffset.UTC));
        } else if (notification.getReadAt() == null) {
            notification.setReadAt(OffsetDateTime.now(ZoneOffset.UTC));
        }

        return toResponse(notificationRepository.save(notification));
    }

    private QueueTicket requireTicketWithValidToken(UUID ticketId, String rawToken) {
        if (ticketId == null || rawToken == null || rawToken.isBlank()) {
            throw queueTicketNotFound();
        }

        QueueTicket ticket = queueTicketRepository.findById(ticketId)
                .orElseThrow(this::queueTicketNotFound);

        if (!TokenUtils.matches(rawToken, ticket.getPublicTokenHash())) {
            // Same response for unknown ticket IDs and invalid tokens to avoid
            // exposing which queue ticket IDs exist.
            throw queueTicketNotFound();
        }

        return ticket;
    }

    private NotificationResponse toResponse(AppNotification notification) {
        return new NotificationResponse(
                notification.getId(),
                notification.getOrderId(),
                notification.getQueueTicketId(),
                notification.getNotificationType(),
                notification.getTitle(),
                notification.getBody(),
                notification.getChannel(),
                notification.getStatus(),
                notification.getCreatedAt(),
                notification.getReadAt());
    }

    private ApiException queueTicketNotFound() {
        return new ApiException(
                HttpStatus.NOT_FOUND,
                "QUEUE_TICKET_NOT_FOUND",
                "error.queue.ticket-not-found");
    }

    private ApiException notificationNotFound() {
        return new ApiException(
                HttpStatus.NOT_FOUND,
                "NOTIFICATION_NOT_FOUND",
                "error.notification.not-found");
    }
}
