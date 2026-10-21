package com.restaurant.platform.dto.order;

import java.util.UUID;

public record CreateStaffOrderResponse(
        UUID orderId,
        String orderNumber,
        String orderType,
        String orderChannel,
        String status,
        String currency,
        long subtotal,
        long totalAmount,
        UUID queueTicketId,
        Integer queueNumber,
        String queueDisplayCode,
        String paymentStatus
) {
}
