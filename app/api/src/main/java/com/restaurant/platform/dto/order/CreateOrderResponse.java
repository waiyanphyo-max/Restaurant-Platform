package com.restaurant.platform.dto.order;

import java.util.UUID;

public record CreateOrderResponse(
        UUID orderId,
        String orderNumber,
        String orderType,
        String orderChannel,
        String status,
        String currency,
        long subtotal,
        long deliveryFee,
        long discountAmount,
        long totalAmount,
        QueueInfo queue
) {

    public record QueueInfo(
            UUID ticketId,
            int queueNumber,
            String displayCode,
            String status,
            String trackingToken
    ) {
    }
}