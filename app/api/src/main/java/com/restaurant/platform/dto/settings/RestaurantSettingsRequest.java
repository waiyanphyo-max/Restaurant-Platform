package com.restaurant.platform.dto.settings;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

public record RestaurantSettingsRequest(
        @NotBlank @Pattern(regexp = "[A-Za-z]{3}") String currency,
        @NotBlank @Size(max = 60) String timezone,
        @NotNull @PositiveOrZero Long minimumOrder,
        @NotNull @PositiveOrZero Long defaultDeliveryFee,
        @NotNull Boolean acceptsOrders,
        @NotNull Boolean allowQrOrder,
        @NotNull Boolean allowDelivery,
        @NotNull Boolean allowTakeaway
) {
}
