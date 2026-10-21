package com.restaurant.platform.dto.customer;

import java.time.OffsetDateTime;

public record CustomerOrderStatusDto(
        String status,
        OffsetDateTime changedAt
) {
}
