package com.restaurant.platform.dto.order;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

public record CreateDeliveryOrderRequest(
        @NotNull UUID addressId,
        @NotNull UUID deliveryZoneId,
        @Size(max = 150) String recipientName,
        @Size(max = 30) String recipientPhone,
        @Size(max = 2000) String deliveryNote,
        @Size(max = 30) String paymentMethod,
        @NotEmpty @Size(max = 50) List<@Valid CreateOrderItemRequest> items
) {
}
