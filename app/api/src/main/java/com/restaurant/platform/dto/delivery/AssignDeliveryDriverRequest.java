package com.restaurant.platform.dto.delivery;

import jakarta.validation.constraints.NotNull;
import java.time.OffsetDateTime;
import java.util.UUID;

public record AssignDeliveryDriverRequest(
        @NotNull UUID driverUserId,
        String note,
        OffsetDateTime expectedUpdatedAt
) {
    public AssignDeliveryDriverRequest(UUID driverUserId, String note) {
        this(driverUserId, note, null);
    }
}
