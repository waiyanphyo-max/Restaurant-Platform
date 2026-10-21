package com.restaurant.platform.dto.member;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public record TransferRestaurantOwnershipRequest(
        @NotNull UUID newOwnerUserId
) {
}
