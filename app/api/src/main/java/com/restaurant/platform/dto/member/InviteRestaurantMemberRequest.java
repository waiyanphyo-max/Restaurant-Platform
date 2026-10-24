package com.restaurant.platform.dto.member;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record InviteRestaurantMemberRequest(
        @NotBlank @Email @Size(max = 320) String email,
        @Size(max = 150) String fullName,
        @NotBlank @Pattern(regexp = "(?i)MANAGER|STAFF|DELIVERY_DRIVER") String role
) {
}
