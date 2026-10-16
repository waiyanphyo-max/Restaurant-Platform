package com.restaurant.platform.dto.order;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Max;

import java.util.UUID;

public record ModifierSelectionRequest(

        @NotNull
        UUID modifierOptionId,

        @Min(1)
        @Max(10)
        int quantity
) {
}