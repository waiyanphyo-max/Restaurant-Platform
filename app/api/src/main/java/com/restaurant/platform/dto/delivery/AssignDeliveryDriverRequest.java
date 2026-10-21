package com.restaurant.platform.dto.delivery;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public record AssignDeliveryDriverRequest(
        @NotNull UUID driverUserId,
        String note
) {
}
