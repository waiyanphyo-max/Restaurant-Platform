package com.restaurant.platform.dto.menu;

import java.util.UUID;

public record ModifierOptionResponse(
        UUID id,
        UUID groupId,
        String name,
        long additionalPrice,
        boolean available
) {
}
