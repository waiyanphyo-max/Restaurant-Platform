package com.restaurant.platform.dto.order;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Explicit kitchen commands; delivery pickup and cash collection use separate APIs. */
public record OrderActionRequest(
        @NotBlank @Pattern(regexp = "ACCEPT|COMPLETE|CANCEL") String action,
        @NotBlank @Pattern(regexp = "PENDING|ACCEPTED|PREPARING|READY|OUT_FOR_DELIVERY|COMPLETED|CANCELLED") String expectedStatus,
        @Size(max = 500) String reason
) {}
