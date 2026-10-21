package com.restaurant.platform.dto.order;

import java.util.List;
import java.util.UUID;

public record OrderItemDetailDto(
        UUID id,
        UUID productId,
        UUID variantId,
        String productName,
        String variantName,
        long unitPrice,
        int quantity,
        long subtotal,
        String specialInstruction,
        List<OrderItemModifierDto> modifiers
) {
    public OrderItemDetailDto {
        modifiers = modifiers == null ? List.of() : List.copyOf(modifiers);
    }
}
