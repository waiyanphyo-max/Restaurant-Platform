package com.restaurant.platform.dto.platform;

import com.restaurant.platform.dto.restaurant.RestaurantResponse;

import java.util.List;
import java.util.UUID;

/** Does not contain QR credentials, invite tokens, or Auth provider credentials. */
public record PlatformRestaurantDetailResponse(
        RestaurantResponse restaurant,
        String currency,
        String timezone,
        long memberCount,
        long orderCount,
        List<Owner> owners,
        PlatformRestaurantConfiguration configuration,
        String ownerWorkspaceUrl,
        String qrSetupUrl,
        List<String> setupInstructions) {
    public record Owner(UUID userId, String email, String fullName, String invitationStatus) {}
}
