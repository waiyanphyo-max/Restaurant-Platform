package com.restaurant.platform.dto.customer;

import java.time.OffsetDateTime;
import java.util.UUID;

public record CustomerPaymentDto(
        UUID id,
        String method,
        String status,
        long amount,
        OffsetDateTime paidAt,
        OffsetDateTime createdAt
) {
}
