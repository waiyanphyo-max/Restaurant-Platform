package com.restaurant.platform.dto.delivery;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public record DefaultDeliveryDriverRequest(
        @NotNull UUID driverUserId
) {
}
