package com.restaurant.platform.dto.order;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public record CustomerDeliveryQuote(
        UUID restaurantId,
        String restaurantName,
        String currency,
        long subtotal,
        long deliveryFee,
        long discountAmount,
        long totalAmount,
        String paymentMethod,
        Destination destination,
        List<Line> lines,
        String confirmationToken,
        UUID idempotencyKey
) {
    public record Destination(
            String source,
            UUID addressId,
            String address,
            String city,
            String township,
            BigDecimal latitude,
            BigDecimal longitude,
            String recipientName,
            String recipientPhone,
            String deliveryNote
    ) {}

    public record Line(UUID productId, UUID variantId, String productName, String variantName,
                       int quantity, long unitPrice, long subtotal, List<Modifier> modifiers) {}

    public record Modifier(UUID modifierOptionId, String name, int quantity, long additionalPrice) {}
}
