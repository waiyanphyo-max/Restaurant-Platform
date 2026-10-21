package com.restaurant.platform.dto.customer;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

public record CustomerAddressResponse(
        UUID id,
        String label,
        String recipientName,
        String houseNo,
        String street,
        String ward,
        String township,
        String city,
        BigDecimal latitude,
        BigDecimal longitude,
        String deliveryNote,
        boolean isDefault,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt
) {
}
