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
        OffsetDateTime updatedAt,
        String description
) {
    public ProductVariantResponse(
            UUID id, UUID productId, String name, long price, String imageUrl, boolean available,
            OffsetDateTime createdAt, OffsetDateTime updatedAt) {
        this(id, productId, name, price, imageUrl, available, createdAt, updatedAt, null);
    }

    /** Backward-compatible constructor for existing tests and consumers. */
    public ProductVariantResponse(
            UUID id, UUID productId, String name, long price, boolean available,
            OffsetDateTime createdAt, OffsetDateTime updatedAt) {
        this(id, productId, name, price, null, available, createdAt, updatedAt, null);
    }
}
