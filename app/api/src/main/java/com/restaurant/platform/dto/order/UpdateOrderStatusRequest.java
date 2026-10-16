package com.restaurant.platform.dto.order;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record UpdateOrderStatusRequest(

        @NotBlank
        @Pattern(
                regexp = "ACCEPTED|PREPARING|READY|OUT_FOR_DELIVERY|COMPLETED|CANCELLED"
        )
        String status,

        @Size(max = 500)
        String note

) {
}