package com.restaurant.platform.dto.platform;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record PlatformRestaurantConfigurationRequest(
        @NotBlank @Size(max = 150) String name,
        @NotBlank @Size(max = 100) @Pattern(regexp = "[a-z0-9]+(?:-[a-z0-9]+)*") String slug,
        @Size(max = 2000) String logoUrl,
        PlatformRestaurantConfiguration configuration) {}
