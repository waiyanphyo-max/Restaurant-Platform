package com.restaurant.platform.dto.table;

import java.util.UUID;

public record DiningTableQrTokenResponse(
        UUID tableId,
        String tableNumber,
        String qrToken
) {
}
