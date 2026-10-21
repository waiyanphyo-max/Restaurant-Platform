package com.restaurant.platform.dto.menu;

import java.util.UUID;

public record CategoryResponse(
        UUID id,
        String name,
        int displayOrder,
        boolean active
) {
}
