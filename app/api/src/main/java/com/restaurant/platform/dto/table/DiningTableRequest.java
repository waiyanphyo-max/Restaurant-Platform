package com.restaurant.platform.dto.table;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record DiningTableRequest(
        @NotBlank @Size(max = 30) @Pattern(regexp = "[A-Za-z0-9][A-Za-z0-9._ -]*")
        String tableNumber,
        Boolean active
) {
}
