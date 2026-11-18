package com.restaurant.platform.dto.order;

import java.util.UUID;

public record DeliveryZoneDto(
        UUID id,
        String name,
        long deliveryFee,
        long minimumOrder,
        String coverageCity,
        String coverageTownship,
        UUID regionId,UUID districtId,UUID townshipId,
        String regionName,String districtName
) {
    public DeliveryZoneDto(UUID id,String name,long deliveryFee,long minimumOrder,String coverageCity,String coverageTownship) {
        this(id,name,deliveryFee,minimumOrder,coverageCity,coverageTownship,null,null,null,null,null);
    }
}
