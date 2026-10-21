package com.restaurant.platform.dto.menu;

import java.util.UUID;

public record MenuModifierOptionDto(
        UUID id,
        String name,
        long additionalPrice,
        boolean available
) {
}
