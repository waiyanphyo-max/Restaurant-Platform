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
        if (userId == null) {
            throw new ApiException(
                    HttpStatus.UNAUTHORIZED,
                    "AUTHENTICATION_REQUIRED",
                    "error.authentication.required");
        }

        String normalizedStatus = status == null || status.isBlank()
                ? null
                : status.trim().toUpperCase(Locale.ROOT);

        List<AppNotification> notifications;
        if (normalizedStatus == null) {
            notifications = notificationRepository.findByUserIdOrderByCreatedAtDesc(userId);
        } else {
            if (!ALLOWED_STATUSES.contains(normalizedStatus)) {
                throw new ApiException(
                        HttpStatus.BAD_REQUEST,
                        "INVALID_NOTIFICATION_STATUS",
                        "error.notification.invalid-status");
            }
            notifications = notificationRepository
                    .findByUserIdAndStatusOrderByCreatedAtDesc(userId, normalizedStatus);
        }

        return notifications.stream().map(this::toResponse).toList();
    }

    @Transactional
    public NotificationResponse markReadForUser(UUID userId, UUID notificationId) {
        if (userId == null) {
            throw new ApiException(
                    HttpStatus.UNAUTHORIZED,
                    "AUTHENTICATION_REQUIRED",
                    "error.authentication.required");
        }

        AppNotification notification = notificationRepository
                .findByIdAndUserId(notificationId, userId)
                .orElseThrow(this::notificationNotFound);

        markRead(notification);
        return toResponse(notificationRepository.save(notification));
    }

    private void markRead(AppNotification notification) {
        if (!"READ".equals(notification.getStatus())) {
            notification.setStatus("READ");
            notification.setReadAt(OffsetDateTime.now(ZoneOffset.UTC));
        } else if (notification.getReadAt() == null) {
            notification.setReadAt(OffsetDateTime.now(ZoneOffset.UTC));
        }
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
