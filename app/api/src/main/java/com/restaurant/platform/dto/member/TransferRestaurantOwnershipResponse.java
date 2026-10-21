package com.restaurant.platform.dto.member;

import java.util.UUID;

public record TransferRestaurantOwnershipResponse(
        UUID restaurantId,
        UUID previousOwnerUserId,
        UUID newOwnerUserId,
        String previousOwnerRole,
        String newOwnerRole
) {
}
