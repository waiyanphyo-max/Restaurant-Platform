package com.restaurant.platform.dto.order;

import java.util.UUID;

public record DeliveryZoneDto(
        UUID id,
        String name,
        long deliveryFee,
        long minimumOrder,
        String coverageCity,
        String coverageTownship
) {
}
