package com.restaurant.platform.dto.table;

import java.time.OffsetDateTime;
import java.util.UUID;

public record DiningTableResponse(
        UUID id,
        UUID restaurantId,
        String tableNumber,
        boolean active,
        OffsetDateTime createdAt
) {
}
