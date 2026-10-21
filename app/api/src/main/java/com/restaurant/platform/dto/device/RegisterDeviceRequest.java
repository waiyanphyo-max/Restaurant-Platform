package com.restaurant.platform.dto.device;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record RegisterDeviceRequest(
        @NotBlank @Size(max = 4096) String pushToken,
        @NotBlank @Pattern(regexp = "ANDROID|IOS|WEB") String platform
) {
}
