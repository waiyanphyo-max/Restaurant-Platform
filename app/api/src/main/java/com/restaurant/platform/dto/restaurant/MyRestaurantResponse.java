package com.restaurant.platform.dto.restaurant;

import java.util.UUID;

public record MyRestaurantResponse(
        UUID restaurantId,
        String name,
        String slug,
        String role,
        boolean active
) {
}
