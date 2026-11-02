package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.notification.NotificationResponse;
import com.restaurant.platform.entity.AppNotification;
import com.restaurant.platform.repository.AppNotificationRepository;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.security.RestaurantPermission;
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

/** Reuses the personal notification store without exposing another tenant's inbox. */
@Service
@RequiredArgsConstructor
public class RestaurantNotificationService {
    private final AppNotificationRepository repository;
    private final RestaurantAuthorization authorization;

    @Transactional(readOnly = true)
    public List<NotificationResponse> list(UUID restaurantId, String status) {
        authorization.requirePermission(restaurantId, RestaurantPermission.RESTAURANT_READ);
        UUID userId = authorization.requireAuthenticatedUserId();
        String normalized = status == null || status.isBlank() ? null : status.trim().toUpperCase(Locale.ROOT);
        if (normalized != null && !Set.of("PENDING", "SENT", "FAILED", "READ").contains(normalized)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_NOTIFICATION_STATUS", "error.notification.invalid-status");
        }
        return repository.findForRestaurantUser(restaurantId, userId, normalized).stream().map(this::response).toList();
    }

    @Transactional
    public NotificationResponse markRead(UUID restaurantId, UUID notificationId) {
        authorization.requirePermission(restaurantId, RestaurantPermission.RESTAURANT_READ);
        UUID userId = authorization.requireAuthenticatedUserId();
        AppNotification notification = repository.findForRestaurantUserById(restaurantId, userId, notificationId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOTIFICATION_NOT_FOUND", "error.notification.not-found"));
        notification.setStatus("READ");
        if (notification.getReadAt() == null) notification.setReadAt(OffsetDateTime.now(ZoneOffset.UTC));
        return response(repository.save(notification));
    }

    private NotificationResponse response(AppNotification n) {
        return new NotificationResponse(n.getId(), n.getOrderId(), n.getQueueTicketId(), n.getNotificationType(),
                n.getTitle(), n.getBody(), n.getChannel(), n.getStatus(), n.getCreatedAt(), n.getReadAt());
    }
}
