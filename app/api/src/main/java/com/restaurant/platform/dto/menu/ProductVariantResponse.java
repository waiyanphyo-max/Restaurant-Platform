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
    /** Backward-compatible constructor for existing tests and consumers. */
    public ProductVariantResponse(
            UUID id, UUID productId, String name, long price, boolean available,
            OffsetDateTime createdAt, OffsetDateTime updatedAt) {
        this(id, productId, name, price, null, available, createdAt, updatedAt);
    }
}
