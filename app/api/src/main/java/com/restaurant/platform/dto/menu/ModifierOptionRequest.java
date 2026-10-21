package com.restaurant.platform.dto.menu;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

public record ModifierOptionRequest(
        @NotBlank @Size(max = 100) String name,
        @NotNull @PositiveOrZero Long additionalPrice,
        @NotNull Boolean available
) {
}
