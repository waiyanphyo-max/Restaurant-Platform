package com.restaurant.platform.dto.payment;

import java.time.OffsetDateTime;
import java.util.UUID;

public record PaymentResponse(
        UUID id,
        UUID orderId,
        String method,
        String status,
        long amount,
        OffsetDateTime paidAt,
        OffsetDateTime createdAt
) {
}
