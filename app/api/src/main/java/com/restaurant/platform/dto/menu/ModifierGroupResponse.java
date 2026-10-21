package com.restaurant.platform.dto.menu;

import java.util.List;
import java.util.UUID;

public record ModifierGroupResponse(
        UUID id,
        String name,
        boolean required,
        int minSelections,
        int maxSelections,
        boolean active,
        List<ModifierOptionResponse> options
) {
    public ModifierGroupResponse {
        options = options == null ? List.of() : List.copyOf(options);
    }
}
