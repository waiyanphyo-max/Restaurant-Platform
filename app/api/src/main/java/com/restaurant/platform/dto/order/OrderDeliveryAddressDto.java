package com.restaurant.platform.dto.order;

import java.util.UUID;

/** Immutable order destination snapshot, disclosed only to restaurant order handlers. */
public record OrderDeliveryAddressDto(
        UUID regionId, UUID districtId, UUID townshipId,
        String region, String district, String township,
        String ward, String street, String houseNo, String formattedAddress,
        String recipientName, String recipientPhone, String instructions
) {}
