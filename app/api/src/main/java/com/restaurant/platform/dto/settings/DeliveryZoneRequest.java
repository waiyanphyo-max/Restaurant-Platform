package com.restaurant.platform.dto.settings;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

public record DeliveryZoneRequest(
        @NotBlank @Size(max = 100) String name,
        @NotNull @PositiveOrZero Long deliveryFee,
        @NotNull @PositiveOrZero Long minimumOrder,
        Boolean active,
        @Size(max = 100) String coverageCity,
        @Size(max = 100) String coverageTownship
) {
}
