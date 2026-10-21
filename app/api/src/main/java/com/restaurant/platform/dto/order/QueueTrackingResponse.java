package com.restaurant.platform.dto.order;

import java.time.OffsetDateTime;
import java.util.UUID;

public record QueueTrackingResponse(
        UUID ticketId,
        int queueNumber,
        String displayCode,
        String queueStatus,
        String orderNumber,
        String orderStatus,
        OffsetDateTime createdAt,
        OffsetDateTime readyAt,
        OffsetDateTime calledAt,
        OffsetDateTime completedAt
) {
}