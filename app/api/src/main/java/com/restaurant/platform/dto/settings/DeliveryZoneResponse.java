package com.restaurant.platform.dto.settings;

import java.util.UUID;

public record DeliveryZoneResponse(
        UUID id,
        UUID restaurantId,
        String name,
        long deliveryFee,
        long minimumOrder,
        boolean active
) {
}
