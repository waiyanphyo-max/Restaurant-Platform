package com.restaurant.platform.dto.platform;

import com.restaurant.platform.dto.restaurant.CreateRestaurantRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;

public record PlatformRestaurantProvisionRequest(
        @NotBlank @Email @Size(max = 320) String ownerEmail,
        @Size(max = 150) String ownerFullName,
        @NotNull @Valid CreateRestaurantRequest restaurant,
        UUID ownerUserId,
        @Valid PlatformRestaurantConfiguration configuration
) {
    public PlatformRestaurantProvisionRequest(String ownerEmail, String ownerFullName,
                                             CreateRestaurantRequest restaurant) {
        this(ownerEmail, ownerFullName, restaurant, null, null);
    }
}
