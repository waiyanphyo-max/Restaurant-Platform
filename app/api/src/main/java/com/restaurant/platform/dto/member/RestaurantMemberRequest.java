package com.restaurant.platform.dto.member;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.util.UUID;

public record RestaurantMemberRequest(
        @NotNull UUID userId,
        @NotBlank @Pattern(regexp = "MANAGER|STAFF|DELIVERY_DRIVER") String role
) {
}
