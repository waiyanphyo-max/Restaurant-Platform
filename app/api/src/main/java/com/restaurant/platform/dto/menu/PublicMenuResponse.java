package com.restaurant.platform.dto.menu;

import java.util.List;
import java.util.UUID;

public record PublicMenuResponse(
        UUID restaurantId,
        String restaurantName,
        String slug,
        String description,
        String phone,
        String address,
        String logoUrl,
        String currency,
        List<MenuCategoryDto> categories
) {
}