package com.restaurant.platform.dto.settings;

import java.util.UUID;
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
        @Size(max = 100) String coverageTownship,
        UUID regionId, UUID districtId, UUID townshipId
) {
    public DeliveryZoneRequest(String name,Long deliveryFee,Long minimumOrder,Boolean active,String coverageCity,String coverageTownship) {
        this(name,deliveryFee,minimumOrder,active,coverageCity,coverageTownship,null,null,null);
    }
}
