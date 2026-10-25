package com.restaurant.platform.dto.menu;

import java.time.OffsetDateTime;
import java.util.UUID;

public record ProductVariantResponse(
        UUID id,
        UUID productId,
        String name,
        long price,
        String imageUrl,
        boolean available,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt
) {
}
