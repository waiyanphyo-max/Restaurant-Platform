package com.restaurant.platform.dto.order;

import java.time.OffsetDateTime;
import java.util.UUID;
import java.util.List;

public record OrderSummaryDto(
        UUID id,
        String orderNumber,
        String orderType,
        String orderChannel,
        String status,
        long subtotal,
        long deliveryFee,
        long totalAmount,
        OffsetDateTime createdAt,
        UUID queueTicketId,
        List<OrderItemDetailDto> items,
        OrderDeliveryAddressDto deliveryDestination,
        String orderNote,
        List<String> availableActions
) {
    public OrderSummaryDto {
        items = items == null ? List.of() : List.copyOf(items);
        availableActions = availableActions == null ? List.of() : List.copyOf(availableActions);
    }

    public OrderSummaryDto(UUID id, String orderNumber, String orderType, String orderChannel,
                           String status, long subtotal, long deliveryFee, long totalAmount, OffsetDateTime createdAt) {
        this(id, orderNumber, orderType, orderChannel, status, subtotal, deliveryFee, totalAmount, createdAt,
                null, List.of(), null, null, List.of());
    }
}
