package com.restaurant.platform.dto.settings;

import java.util.UUID;

public record CommonQrTokenResponse(
        UUID restaurantId,
        String commonQrToken
) {
}
