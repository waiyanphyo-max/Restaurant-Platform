package com.restaurant.platform.dto.order;

import java.time.OffsetDateTime;
import java.util.UUID;

public record QueueTicketManagerDto(
        UUID ticketId,
        int queueNumber,
        String displayCode,
        String status,
        OffsetDateTime createdAt,
        OffsetDateTime readyAt,
        OffsetDateTime calledAt,
        OffsetDateTime completedAt
) {
}
