package com.restaurant.platform.dto.menu;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.util.UUID;

public record ProductRequest(
        @NotNull UUID categoryId,
        @NotBlank @Size(max = 150) String name,
        @Size(max = 5000) String description,
        @NotNull @PositiveOrZero Long price,
        @Size(max = 2000) String imageUrl,
        @NotNull Boolean trackStock,
        @PositiveOrZero Integer stockQuantity,
        @NotNull Boolean available
) {
}
