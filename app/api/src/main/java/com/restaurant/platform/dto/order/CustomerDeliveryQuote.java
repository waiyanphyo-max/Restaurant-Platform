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
    /** Coordinates are both null for a text-only saved or MANUAL_TEXT destination. */
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
            String deliveryNote,
            UUID regionId, UUID districtId, UUID townshipId,
            String regionName, String districtName, String ward, String street, String houseNo
    ) {
        public Destination(String source,UUID addressId,String address,String city,String township,BigDecimal latitude,BigDecimal longitude,String recipientName,String recipientPhone,String deliveryNote) {
            this(source,addressId,address,city,township,latitude,longitude,recipientName,recipientPhone,deliveryNote,null,null,null,null,null,null,null,null);
        }
    }

    public record Line(UUID productId, UUID variantId, String productName, String variantName,
                       int quantity, long unitPrice, long subtotal, List<Modifier> modifiers) {}

    public record Modifier(UUID modifierOptionId, String name, int quantity, long additionalPrice) {}
}
