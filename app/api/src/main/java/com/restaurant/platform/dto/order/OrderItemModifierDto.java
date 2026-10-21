package com.restaurant.platform.dto.order;

import java.util.UUID;

public record OrderItemModifierDto(
        UUID id,
        UUID modifierOptionId,
        String name,
        long additionalPrice,
        int quantity
) {
}
