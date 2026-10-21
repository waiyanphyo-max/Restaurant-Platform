package com.restaurant.platform.dto.restaurant;

import java.util.UUID;

public record RestaurantOnboardingResponse(
        RestaurantResponse restaurant,
        String initialRole,
        String currency,
        String timezone,
        String commonQrToken
) {
}
