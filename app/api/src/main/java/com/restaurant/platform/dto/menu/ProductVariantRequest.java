package com.restaurant.platform.dto.menu;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

public record ProductVariantRequest(
        @NotBlank @Size(max = 100) String name,
        @NotNull @PositiveOrZero Long price,
        @NotNull Boolean available,
        @Size(max = 2000) String imageUrl
) {
    /** Backward-compatible constructor for clients that have not added image uploads yet. */
    public ProductVariantRequest(String name, Long price, Boolean available) {
        this(name, price, available, null);
    }
}
