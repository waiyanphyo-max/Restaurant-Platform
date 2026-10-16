package com.restaurant.platform.dto.menu;

import java.util.List;
import java.util.UUID;

public record MenuProductDto(
        UUID id,
        String name,
        String description,
        Long price,
        String imageUrl,
        boolean available,
        boolean trackStock,
        Integer stockQuantity,
        List<MenuVariantDto> variants
) {
}