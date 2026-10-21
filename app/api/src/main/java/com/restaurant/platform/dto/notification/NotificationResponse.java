package com.restaurant.platform.dto.notification;

import java.time.OffsetDateTime;
import java.util.UUID;

public record NotificationResponse(
        UUID id,
        UUID orderId,
        UUID queueTicketId,
        String notificationType,
        String title,
        String body,
        String channel,
        String status,
        OffsetDateTime createdAt,
        OffsetDateTime readAt
) {
}
