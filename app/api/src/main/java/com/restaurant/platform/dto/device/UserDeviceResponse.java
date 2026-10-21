package com.restaurant.platform.dto.device;

import java.time.OffsetDateTime;
import java.util.UUID;

public record UserDeviceResponse(
        UUID id,
        String platform,
        boolean active,
        OffsetDateTime lastSeenAt,
        OffsetDateTime createdAt
) {
}
