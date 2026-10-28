package com.restaurant.platform.dto.platform;

/** Aggregate counts visible only to an allowlisted platform administrator. */
public record PlatformOverviewResponse(
        long totalRestaurants,
        long activeRestaurants,
        long inactiveRestaurants,
        long totalOrders,
        long totalRestaurantMembers
) {
}
