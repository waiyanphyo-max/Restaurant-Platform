package com.restaurant.platform.dto.delivery;

import java.time.OffsetDateTime;
import java.util.UUID;

public record DeliveryTaskDto(
        UUID id,
        UUID orderId,
        String orderNumber,
        String orderStatus,
        String status,
        UUID driverUserId,
        String customerName,
        String customerPhone,
        String deliveryAddress,
        String deliveryNote,
        long totalAmount,
        OffsetDateTime assignedAt,
        OffsetDateTime pickedUpAt,
        OffsetDateTime deliveredAt,
        String failureReason,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt
) {
}
