package com.restaurant.platform.dto.restaurant;

import java.time.OffsetDateTime;
import java.math.BigDecimal;
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
        BigDecimal latitude,
        BigDecimal longitude,
        String logoUrl,
        boolean active,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt
) {
}
