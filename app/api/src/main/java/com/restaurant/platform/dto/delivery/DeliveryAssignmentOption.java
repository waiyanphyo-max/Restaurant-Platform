package com.restaurant.platform.dto.delivery;

import com.restaurant.platform.security.RestaurantRole;
import java.util.UUID;

public record DeliveryAssignmentOption(UUID userId, String fullName, String email, RestaurantRole role) {}
