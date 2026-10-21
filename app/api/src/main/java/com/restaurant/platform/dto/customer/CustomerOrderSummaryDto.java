package com.restaurant.platform.dto.customer;

import java.time.OffsetDateTime;
import java.util.UUID;

public record CustomerOrderSummaryDto(
        UUID id,
        UUID restaurantId,
        String orderNumber,
        String orderType,
        String orderChannel,
        String status,
        long subtotal,
        long deliveryFee,
        long discountAmount,
        long totalAmount,
        OffsetDateTime createdAt
) {
}
