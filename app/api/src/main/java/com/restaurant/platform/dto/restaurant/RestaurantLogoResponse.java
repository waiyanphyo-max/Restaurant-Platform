package com.restaurant.platform.dto.restaurant;

import java.util.UUID;

public record RestaurantLogoResponse(
        UUID restaurantId,
        String logoUrl
) {
}
