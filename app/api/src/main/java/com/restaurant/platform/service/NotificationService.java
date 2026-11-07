package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.notification.NotificationResponse;
import com.restaurant.platform.entity.AppNotification;
import com.restaurant.platform.repository.AppNotificationRepository;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class NotificationService {

    private static final Set<String> ALLOWED_STATUSES =
            Set.of("PENDING", "SENT", "FAILED", "READ");

    private final AppNotificationRepository notificationRepository;

    @Transactional(readOnly = true)
    public List<NotificationResponse> listForUser(UUID userId, String status) {
        requireUser(userId);
        String normalizedStatus = normalizeStatus(status);
        List<AppNotification> notifications = normalizedStatus == null
                ? notificationRepository.findByUserIdOrderByCreatedAtDesc(userId)
                : notificationRepository.findByUserIdAndStatusOrderByCreatedAtDesc(userId, normalizedStatus);
        return notifications.stream().map(this::toResponse).toList();
    }

    @Transactional
    public NotificationResponse markReadForUser(UUID userId, UUID notificationId) {
        requireUser(userId);
        AppNotification notification = notificationRepository
                .findByIdAndUserId(notificationId, userId)
                .orElseThrow(this::notificationNotFound);
        return markRead(notification);
    }

    @Transactional(readOnly = true)
    public List<NotificationResponse> listCustomerDeliveryNotifications(UUID restaurantId, UUID userId, String status) {
        requireUser(userId);
        return notificationRepository.findCustomerDeliveryNotifications(
                        restaurantId, userId, CustomerOrderNotifications.TYPES, normalizeStatus(status))
                .stream().map(this::toResponse).toList();
    }

    @Transactional
    public NotificationResponse markCustomerDeliveryNotificationRead(UUID restaurantId, UUID userId, UUID notificationId) {
        requireUser(userId);
        AppNotification notification = notificationRepository.findCustomerDeliveryNotificationForUpdate(
                        restaurantId, userId, CustomerOrderNotifications.TYPES, notificationId)
                .orElseThrow(this::notificationNotFound);
        return markRead(notification);
    }

    private String normalizeStatus(String status) {
        if (status == null || status.isBlank()) {
            return null;
        }
        String normalized = status.trim().toUpperCase(Locale.ROOT);
        if (!ALLOWED_STATUSES.contains(normalized)) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "INVALID_NOTIFICATION_STATUS", "error.notification.invalid-status");
        }
        return normalized;
    }

    private void requireUser(UUID userId) {
        if (userId == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED,
                    "AUTHENTICATION_REQUIRED", "error.authentication.required");
        }
    }

    private NotificationResponse markRead(AppNotification notification) {
        if (!"READ".equals(notification.getStatus()) || notification.getReadAt() == null) {
            notification.setStatus("READ");
            notification.setReadAt(OffsetDateTime.now(ZoneOffset.UTC));
        }
        return toResponse(notificationRepository.save(notification));
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

    private ApiException notificationNotFound() {
        return new ApiException(
                HttpStatus.NOT_FOUND,
                "NOTIFICATION_NOT_FOUND",
                "error.notification.not-found");
    }
}
