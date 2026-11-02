package com.restaurant.platform.dto.delivery;

import java.util.UUID;

/** The existing assignment policy permits dedicated DRIVER members only. */
public record DeliveryAssignmentOption(UUID userId, String fullName, String email) {}
