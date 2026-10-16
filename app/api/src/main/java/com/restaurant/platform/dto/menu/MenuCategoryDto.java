package com.restaurant.platform.dto.menu;

import java.util.List;
import java.util.UUID;

public record MenuCategoryDto(
        UUID id,
        String name,
        int displayOrder,
        List<MenuProductDto> products
) {
}