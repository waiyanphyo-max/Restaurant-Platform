package com.restaurant.platform.dto.order;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public record ManagerOrderDetailDto(
        UUID id,
        UUID restaurantId,
        String orderNumber,
        UUID customerId,
        UUID createdByUserId,
        UUID tableId,
        UUID queueTicketId,
        UUID deliveryZoneId,
        String orderType,
        String orderChannel,
        String status,
        long subtotal,
        long deliveryFee,
        long discountAmount,
        long totalAmount,
        String deliveryName,
        String deliveryPhone,
        String deliveryAddress,
        String deliveryNote,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt,
        List<OrderItemDetailDto> items,
        List<OrderStatusHistoryDto> statusHistory
) {
    public ManagerOrderDetailDto {
        items = items == null ? List.of() : List.copyOf(items);
        statusHistory = statusHistory == null ? List.of() : List.copyOf(statusHistory);
    }
}
