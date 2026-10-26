package com.restaurant.platform.security;

import com.restaurant.platform.common.error.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Separates platform-level onboarding permissions from restaurant membership roles.
 * The allowlist contains Supabase Auth user UUIDs and must be configured only on the API server.
 */
@Component
public class PlatformAdminAuthorization {
    private final RestaurantAuthorization restaurantAuthorization;
    private final String configuredPlatformAdminIds;

    public PlatformAdminAuthorization(
            RestaurantAuthorization restaurantAuthorization,
            @Value("${app.security.platform-admin-user-ids:}") String configuredPlatformAdminIds) {
        this.restaurantAuthorization = restaurantAuthorization;
        this.configuredPlatformAdminIds = configuredPlatformAdminIds == null
                ? "" : configuredPlatformAdminIds;
    }

    public UUID requirePlatformAdmin() {
        UUID actorId = restaurantAuthorization.requireAuthenticatedUserId();
        Set<UUID> allowlist = parseConfiguredIds();

        if (allowlist.isEmpty()) {
            throw new ApiException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "PLATFORM_ADMIN_NOT_CONFIGURED",
                    "error.platform-admin.not-configured");
        }

        if (!allowlist.contains(actorId)) {
            throw new ApiException(
                    HttpStatus.FORBIDDEN,
                    "PLATFORM_ADMIN_REQUIRED",
                    "error.platform-admin.required");
        }
        return actorId;
    }

    private Set<UUID> parseConfiguredIds() {
        return Arrays.stream(configuredPlatformAdminIds.split(","))
                .map(String::trim)
                .filter(value -> !value.isBlank())
                .map(this::parseUuidOrNull)
                .filter(java.util.Objects::nonNull)
                .collect(Collectors.toUnmodifiableSet());
    }

    private UUID parseUuidOrNull(String value) {
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException exception) {
            // Ignore malformed entries; invalid configuration never grants access.
            return null;
        }
    }
}
