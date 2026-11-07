package com.restaurant.platform.dto.order;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public record CustomerDeliveryCheckoutRequest(
        UUID addressId,
        @Valid TemporaryDestination temporaryDestination,
        @Size(max = 150) String recipientName,
        @Size(max = 30) String recipientPhone,
        @Size(max = 2000) String deliveryNote,
        @NotEmpty @Size(max = 50) List<@NotNull @Valid CreateOrderItemRequest> items,
        @Pattern(regexp = "[a-f0-9]{64}") String confirmationToken
) {
    public record TemporaryDestination(
            @NotNull TemporarySource source,
            @Size(max = 500) String address,
            @Size(max = 100) String city,
            @Size(max = 100) String township,
            BigDecimal latitude,
            BigDecimal longitude
    ) {}

    public enum TemporarySource { MANUAL_MAP, GPS_CONFIRMED }
}
