package com.restaurant.platform.dto.order;

import java.util.UUID;

/** The verified public context deliberately excludes the QR credential. */
public record QrContextResponse(
        UUID restaurantId,
        QrContextRequest.Kind kind,
        UUID tableId,
        String tableNumber) {
}
