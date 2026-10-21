package com.restaurant.platform.dto.restaurant;

import java.time.OffsetDateTime;
import java.util.UUID;

public record RestaurantResponse(
        UUID id,
        String name,
        String slug,
        String description,
        String phone,
        String address,
        String houseNo,
        String street,
        String ward,
        String township,
        String city,
        String logoUrl,
        boolean active,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt
) {
}
