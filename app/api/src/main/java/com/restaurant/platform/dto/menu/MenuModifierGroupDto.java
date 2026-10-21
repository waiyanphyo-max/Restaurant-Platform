package com.restaurant.platform.dto.menu;

import java.util.List;
import java.util.UUID;

public record MenuModifierGroupDto(
        UUID id,
        String name,
        boolean required,
        int minSelections,
        int maxSelections,
        List<MenuModifierOptionDto> options
) {
}
