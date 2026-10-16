package com.restaurant.platform.dto.order;

import java.time.OffsetDateTime;
import java.util.UUID;

public record OrderSummaryDto(
        UUID id,
        String orderNumber,
        String orderType,
        String orderChannel,
        String status,
        long subtotal,
        long deliveryFee,
        long totalAmount,
        OffsetDateTime createdAt
) {
}