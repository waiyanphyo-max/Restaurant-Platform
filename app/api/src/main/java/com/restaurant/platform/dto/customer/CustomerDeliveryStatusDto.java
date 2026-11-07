package com.restaurant.platform.dto.customer;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public record CustomerDeliveryStatusDto(
        UUID id,
        String status,
        OffsetDateTime assignedAt,
        OffsetDateTime pickedUpAt,
        OffsetDateTime deliveredAt,
        List<CustomerOrderStatusDto> statusHistory
) {
    public CustomerDeliveryStatusDto {
        statusHistory = List.copyOf(statusHistory);
    }
}
