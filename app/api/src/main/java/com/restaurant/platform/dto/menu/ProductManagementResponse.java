package com.restaurant.platform.dto.menu;

import java.time.OffsetDateTime;
import java.util.UUID;

public record ProductManagementResponse(
        UUID id,
        UUID categoryId,
        String name,
        String description,
        long price,
        String imageUrl,
        boolean trackStock,
        Integer stockQuantity,
        boolean available,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt
) {
}
