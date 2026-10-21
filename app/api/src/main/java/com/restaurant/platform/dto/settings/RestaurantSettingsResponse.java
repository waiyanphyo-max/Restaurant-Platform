package com.restaurant.platform.dto.settings;

import java.util.UUID;

public record RestaurantSettingsResponse(
        UUID restaurantId,
        String currency,
        String timezone,
        long minimumOrder,
        long defaultDeliveryFee,
        boolean acceptsOrders,
        boolean allowQrOrder,
        boolean allowDelivery,
        boolean allowTakeaway,
        UUID defaultDeliveryDriverUserId
) {
}
