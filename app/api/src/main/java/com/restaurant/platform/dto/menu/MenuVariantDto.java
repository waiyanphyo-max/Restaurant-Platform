package com.restaurant.platform.dto.menu;

import java.util.UUID;

public record MenuVariantDto(
        UUID id,
        String name,
        Long price,
        boolean available
) {
}