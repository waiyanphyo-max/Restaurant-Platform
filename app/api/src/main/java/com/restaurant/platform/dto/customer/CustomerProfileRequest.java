package com.restaurant.platform.dto.customer;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record CustomerProfileRequest(
        @NotBlank @Size(max = 150) String fullName,
        @NotBlank @Size(max = 30) String phone,
        @NotBlank @Pattern(regexp = "my-MM|en") String preferredLanguage
) {
}
