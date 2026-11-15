package com.restaurant.platform.dto.menu;

import java.util.UUID;

public record MenuVariantDto(
        UUID id,
        String name,
        Long price,
        String imageUrl,
        boolean available,
        String description
) {
    public MenuVariantDto(UUID id, String name, Long price, String imageUrl, boolean available) {
        this(id, name, price, imageUrl, available, null);
    }

    /** Backward-compatible constructor for existing test data and callers. */
    public MenuVariantDto(UUID id, String name, Long price, boolean available) {
        this(id, name, price, null, available, null);
    }
}
