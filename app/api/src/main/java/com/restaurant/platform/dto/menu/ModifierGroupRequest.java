package com.restaurant.platform.dto.menu;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ModifierGroupRequest(
        @NotBlank @Size(max = 100) String name,
        Boolean required,
        @Min(0) Integer minSelections,
        @Min(0) Integer maxSelections,
        Boolean active
) {
}
