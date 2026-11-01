package com.restaurant.platform.dto.order;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** QR credentials are accepted in a body only, never in a URL. */
public record QrContextRequest(
        @NotNull Kind kind,
        @NotBlank @Size(max = 64) String qrToken) {
    public enum Kind { COMMON_QR, TABLE_QR }
}
