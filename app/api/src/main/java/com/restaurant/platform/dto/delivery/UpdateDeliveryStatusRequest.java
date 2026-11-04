package com.restaurant.platform.dto.delivery;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;

public record UpdateDeliveryStatusRequest(
        @NotBlank @Size(max = 30) String status,
        @Size(max = 1000) String failureReason,
        @Size(max = 2000) String note,
        Boolean cashCollected,
        OffsetDateTime expectedUpdatedAt
) {
    public UpdateDeliveryStatusRequest(String status, String failureReason, String note, Boolean cashCollected) {
        this(status, failureReason, note, cashCollected, null);
    }
}
