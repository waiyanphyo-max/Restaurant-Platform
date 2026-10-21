package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.order.QueueTicketManagerDto;
import com.restaurant.platform.entity.AppNotification;
import com.restaurant.platform.entity.DailyQueueCounter;
import com.restaurant.platform.entity.Order;
import com.restaurant.platform.entity.QueueTicket;
import com.restaurant.platform.entity.RestaurantSettings;
import com.restaurant.platform.repository.AppNotificationRepository;
import com.restaurant.platform.repository.DailyQueueCounterRepository;
import com.restaurant.platform.repository.OrderRepository;
import com.restaurant.platform.repository.QueueTicketRepository;
import com.restaurant.platform.repository.RestaurantSettingsRepository;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.security.RestaurantPermission;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class QueueManagementService {

    private static final Set<String> VALID_STATUSES =
            Set.of("WAITING", "READY", "CALLED", "COMPLETED", "CANCELLED");
    private static final Set<String> ACTIVE_STATUSES =
            Set.of("WAITING", "READY", "CALLED");

    private final QueueTicketRepository queueTicketRepository;
    private final DailyQueueCounterRepository dailyQueueCounterRepository;
    private final RestaurantSettingsRepository restaurantSettingsRepository;
    private final OrderRepository orderRepository;
    private final AppNotificationRepository notificationRepository;
    private final RestaurantAuthorization restaurantAuthorization;

    @PreAuthorize("@restaurantAuthorization.hasPermission(#p0, T(com.restaurant.platform.security.RestaurantPermission).QUEUE_MANAGE)")
    @Transactional(readOnly = true)
    public List<QueueTicketManagerDto> listQueue(UUID restaurantId, String status) {
        restaurantAuthorization.requirePermission(restaurantId, RestaurantPermission.QUEUE_MANAGE);

        RestaurantSettings settings = restaurantSettingsRepository.findById(restaurantId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "RESTAURANT_SETTINGS_NOT_FOUND",
                        "error.restaurant.settings-missing"));

        String timezone = settings.getTimezone() == null || settings.getTimezone().isBlank()
                ? "Asia/Yangon"
                : settings.getTimezone();

        LocalDate queueDate;
        try {
            queueDate = LocalDate.now(ZoneId.of(timezone));
        } catch (RuntimeException exception) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "INVALID_RESTAURANT_TIMEZONE",
                    "error.queue.invalid-timezone");
        }

        String normalizedStatus = status == null || status.isBlank()
                ? null
                : status.trim().toUpperCase(Locale.ROOT);

        if (normalizedStatus != null && !VALID_STATUSES.contains(normalizedStatus)) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "INVALID_QUEUE_STATUS",
                    "error.queue.invalid-status");
        }

        DailyQueueCounter counter = dailyQueueCounterRepository
                .findByRestaurantIdAndQueueDate(restaurantId, queueDate)
                .orElse(null);

        if (counter == null) {
            return List.of();
        }

        return queueTicketRepository
                .findByDailyCounterIdOrderByQueueNumberAsc(counter.getId())
                .stream()
                .filter(ticket -> normalizedStatus == null
                        ? ACTIVE_STATUSES.contains(ticket.getStatus())
                        : normalizedStatus.equals(ticket.getStatus()))
                .map(this::toDto)
                .toList();
    }

    @PreAuthorize("@restaurantAuthorization.hasPermission(#p0, T(com.restaurant.platform.security.RestaurantPermission).QUEUE_MANAGE)")
    @Transactional
    public QueueTicketManagerDto callTicket(UUID restaurantId, UUID ticketId) {
        restaurantAuthorization.requirePermission(restaurantId, RestaurantPermission.QUEUE_MANAGE);

        QueueTicket ticket = queueTicketRepository
                .findByIdAndRestaurantIdForUpdate(ticketId, restaurantId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "QUEUE_TICKET_NOT_FOUND",
                        "error.queue.ticket-not-found"));

        if (!"READY".equals(ticket.getStatus())) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "INVALID_QUEUE_TRANSITION",
                    "error.queue.invalid-transition",
                    ticket.getStatus(),
                    "CALLED");
        }

        ticket.setStatus("CALLED");
        ticket.setCalledAt(OffsetDateTime.now(ZoneOffset.UTC));
        QueueTicket saved = queueTicketRepository.save(ticket);

        AppNotification notification = new AppNotification();
        notification.setQueueTicketId(saved.getId());
        Order order = orderRepository.findByQueueTicketId(saved.getId()).orElse(null);
        if (order != null) {
            notification.setOrderId(order.getId());
            if (order.getCustomerId() != null) {
                notification.setUserId(order.getCustomerId());
            }
        }
        notification.setNotificationType("QUEUE_CALLED");
        notification.setTitle("Your queue number is being called");
        notification.setBody("Queue " + saved.getDisplayCode()
                + " is being called. Please come to the collection counter.");
        notification.setChannel("IN_APP");
        notification.setStatus("PENDING");
        notificationRepository.save(notification);

        return toDto(saved);
    }

    private QueueTicketManagerDto toDto(QueueTicket ticket) {
        return new QueueTicketManagerDto(
                ticket.getId(),
                ticket.getQueueNumber(),
                ticket.getDisplayCode(),
                ticket.getStatus(),
                ticket.getCreatedAt(),
                ticket.getReadyAt(),
                ticket.getCalledAt(),
                ticket.getCompletedAt());
    }
}
