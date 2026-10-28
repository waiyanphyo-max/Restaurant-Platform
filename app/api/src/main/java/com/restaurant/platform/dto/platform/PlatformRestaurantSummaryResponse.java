package com.restaurant.platform.dto.platform;

import java.time.OffsetDateTime;
import java.util.UUID;

/** Safe summary fields used by the platform restaurant registry. */
public record PlatformRestaurantSummaryResponse(
        UUID id,
        String name,
        String slug,
        String city,
        String township,
        boolean active,
        OffsetDateTime createdAt,
        String ownerFullName,
        String ownerEmail,
        long memberCount,
        long orderCount
) {
}
