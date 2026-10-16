package com.restaurant.platform.dto.order;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

public record CreateOrderItemRequest(

        @NotNull
        UUID productId,

        UUID variantId,

        @Min(1)
        @Max(999)
        int quantity,

        @Size(max = 500)
        String specialInstruction,

        @Size(max = 20)
        List<@Valid ModifierSelectionRequest> modifiers
) {
}