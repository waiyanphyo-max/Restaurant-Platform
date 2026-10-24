package com.restaurant.platform.dto.member;

import java.time.OffsetDateTime;
import java.util.UUID;

public record RestaurantMemberResponse(
        UUID id,
        UUID restaurantId,
        UUID userId,
        String email,
        String fullName,
        String role,
        OffsetDateTime createdAt
) {
}
