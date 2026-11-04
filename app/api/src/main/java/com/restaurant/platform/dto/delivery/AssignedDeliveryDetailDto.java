package com.restaurant.platform.dto.delivery;

import com.restaurant.platform.common.GeoCoordinates;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public record AssignedDeliveryDetailDto(
        DeliveryTaskDto task,
        Pickup pickup,
        GeoCoordinates destination,
        List<Item> items,
        boolean cashCollectionRequired
) {
    public record Pickup(String name, String address, BigDecimal latitude, BigDecimal longitude) {
    }

    public record Item(
            UUID id, String productName, String variantName, int quantity, String specialInstruction
    ) {
    }
}
