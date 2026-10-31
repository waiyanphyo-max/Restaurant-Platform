package com.restaurant.platform.dto.platform;

import java.util.List;

/** Public deployment metadata only. Changes do not publish websites, DNS, or Android builds. */
public record PlatformRestaurantConfiguration(
        String primaryColor,
        String secondaryColor,
        GuestDomains guestDomains,
        Android android) {
    public record GuestDomains(List<String> staging, List<String> production) {}

    public record Android(AndroidApplication operations, AndroidApplication customer) {}

    public record AndroidApplication(
            String displayName,
            String stagingApplicationId,
            String productionApplicationId,
            String iconPath) {}

    public static PlatformRestaurantConfiguration empty() {
        var app = new AndroidApplication(null, null, null, null);
        return new PlatformRestaurantConfiguration(null, null,
                new GuestDomains(List.of(), List.of()), new Android(app, app));
    }
}
