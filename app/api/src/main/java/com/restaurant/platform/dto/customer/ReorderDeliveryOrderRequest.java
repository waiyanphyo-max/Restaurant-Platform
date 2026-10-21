package com.restaurant.platform.dto.customer;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;

public record ReorderDeliveryOrderRequest(
        @NotNull UUID addressId,
        @NotNull UUID deliveryZoneId,
        @Size(max = 150) String recipientName,
        @Size(max = 30) String recipientPhone,
        @Size(max = 2000) String deliveryNote,
        @Size(max = 30) String paymentMethod
) {
}
