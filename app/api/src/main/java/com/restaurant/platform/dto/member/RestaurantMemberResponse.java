package com.restaurant.platform.dto.member;

import java.time.OffsetDateTime;
import java.util.UUID;

public record RestaurantMemberResponse(
        UUID id,
        UUID restaurantId,
        UUID userId,
        String role,
        OffsetDateTime createdAt
) {
}
