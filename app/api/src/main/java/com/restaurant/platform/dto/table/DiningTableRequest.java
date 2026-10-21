package com.restaurant.platform.dto.table;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record DiningTableRequest(
        @NotBlank @Size(max = 30) String tableNumber,
        Boolean active
) {
}
