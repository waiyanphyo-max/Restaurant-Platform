package com.restaurant.platform.dto.order;

import java.time.OffsetDateTime;
import java.util.UUID;

public record OrderStatusHistoryDto(
        UUID id,
        String status,
        UUID changedByUserId,
        String note,
        OffsetDateTime createdAt
) {
}
