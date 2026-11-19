package com.restaurant.platform.dto.restaurant;

import java.util.UUID;

/** Safe public projection; revision versions only the palette, not name/logo. */
public record RestaurantBrandingResponse(
        UUID restaurantId, String displayName, String logoUrl, RestaurantPalette palette, long revision) { }
