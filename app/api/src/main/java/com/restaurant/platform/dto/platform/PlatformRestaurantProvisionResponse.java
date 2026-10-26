package com.restaurant.platform.dto.platform;

import com.restaurant.platform.dto.restaurant.RestaurantResponse;

import java.util.UUID;

public record PlatformRestaurantProvisionResponse(
        UUID ownerUserId,
        String ownerEmail,
        boolean invitationSent,
        String ownerRole,
        RestaurantResponse restaurant,
        String ownerWorkspaceUrl,
        String commonQrUrl,
        String commonQrToken
) {
}
