package com.restaurant.platform.dto.delivery;

import java.util.UUID;

public record DefaultDeliveryDriverResponse(
        UUID restaurantId,
        UUID defaultDriverUserId
) {
}
