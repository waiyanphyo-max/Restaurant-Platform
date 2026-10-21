package com.restaurant.platform.dto.delivery;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateDeliveryStatusRequest(
        @NotBlank @Size(max = 30) String status,
        @Size(max = 1000) String failureReason,
        @Size(max = 2000) String note
) {
}
