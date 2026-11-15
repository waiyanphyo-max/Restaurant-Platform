package com.restaurant.platform.dto.menu;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

public record ProductVariantRequest(
        @NotBlank @Size(max = 100) String name,
        @NotNull @PositiveOrZero Long price,
        @NotNull Boolean available,
        @Size(max = 2000) String imageUrl,
        @Size(max = 5000) String description
) {
    public ProductVariantRequest(String name, Long price, Boolean available, String imageUrl) {
        this(name, price, available, imageUrl, null);
    }

    /** Backward-compatible constructor for clients that have not added image uploads yet. */
    public ProductVariantRequest(String name, Long price, Boolean available) {
        this(name, price, available, null, null);
    }
}
