package com.restaurant.platform.dto.platform;

import jakarta.validation.constraints.NotNull;

public record PlatformRestaurantStatusRequest(@NotNull Boolean active) {}
