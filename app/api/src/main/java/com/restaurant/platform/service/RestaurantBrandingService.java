package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.restaurant.RestaurantBrandingResponse;
import com.restaurant.platform.dto.restaurant.RestaurantPalette;
import com.restaurant.platform.dto.restaurant.UpdateRestaurantBrandingRequest;
import com.restaurant.platform.entity.Restaurant;
import com.restaurant.platform.entity.RestaurantRuntimeBranding;
import com.restaurant.platform.repository.RestaurantRepository;
import com.restaurant.platform.repository.RestaurantRuntimeBrandingRepository;
import com.restaurant.platform.security.PlatformAdminAuthorization;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.security.RestaurantPermission;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.util.Locale;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class RestaurantBrandingService {
    private static final long MAX_REVISION = 9007199254740991L;
    private final RestaurantRepository restaurants;
    private final RestaurantRuntimeBrandingRepository branding;
    private final RestaurantAuthorization authorization;
    private final PlatformAdminAuthorization platformAuthorization;

    @Transactional(readOnly = true)
    public RestaurantBrandingResponse getPublicBranding(UUID restaurantId) {
        Restaurant restaurant = restaurants.findByIdAndIsActiveTrue(restaurantId)
                .orElseThrow(this::notFound);
        return response(restaurant, branding.findById(restaurantId).orElse(null));
    }

    @Transactional
    public RestaurantBrandingResponse updatePalette(UUID restaurantId, UpdateRestaurantBrandingRequest request) {
        authorization.requirePermission(restaurantId, RestaurantPermission.SETTINGS_MANAGE);
        return persist(restaurantId, request, false);
    }

    /** Provisioning step after restaurant creation; never impersonates or creates a member. */
    @Transactional
    public RestaurantBrandingResponse initializePalette(UUID restaurantId, UpdateRestaurantBrandingRequest request) {
        platformAuthorization.requirePlatformAdmin();
        return persist(restaurantId, request, true);
    }

    private RestaurantBrandingResponse persist(
            UUID restaurantId, UpdateRestaurantBrandingRequest request, boolean initializeOnly) {
        validate(request);
        Restaurant restaurant = restaurants.findActiveForBrandingUpdate(restaurantId).orElseThrow(this::notFound);
        RestaurantRuntimeBranding row = branding.findById(restaurantId).orElse(null);
        long current = row == null ? 0 : row.getRevision();
        if (request.expectedRevision() != current || (initializeOnly && current != 0)) {
            throw new ApiException(HttpStatus.CONFLICT, "RESTAURANT_BRANDING_STALE", "error.branding.stale");
        }
        if (current >= MAX_REVISION) {
            throw new ApiException(HttpStatus.CONFLICT, "RESTAURANT_BRANDING_REVISION_EXHAUSTED", "error.branding.revision-exhausted");
        }
        if (row == null) {
            row = new RestaurantRuntimeBranding();
            row.setRestaurantId(restaurantId);
        }
        row.setPrimaryColor(request.palette().primaryColor().toUpperCase(Locale.ROOT));
        row.setSecondaryColor(request.palette().secondaryColor().toUpperCase(Locale.ROOT));
        row.setBackgroundColor(request.palette().backgroundColor().toUpperCase(Locale.ROOT));
        row.setRevision(current + 1);
        return response(restaurant, branding.saveAndFlush(row));
    }

    private void validate(UpdateRestaurantBrandingRequest request) {
        if (request == null || request.expectedRevision() == null || request.expectedRevision() < 0
                || request.expectedRevision() > MAX_REVISION || !valid(request.palette())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_RESTAURANT_PALETTE", "error.branding.invalid-palette");
        }
    }

    private static boolean valid(RestaurantPalette palette) {
        return palette != null && validColor(palette.primaryColor()) && validColor(palette.secondaryColor())
                && validColor(palette.backgroundColor());
    }

    private static boolean validColor(String value) {
        return value != null && value.length() == 7 && value.matches("#[0-9a-fA-F]{6}");
    }

    private RestaurantBrandingResponse response(Restaurant restaurant, RestaurantRuntimeBranding row) {
        RestaurantPalette palette = row == null ? null : new RestaurantPalette(
                row.getPrimaryColor(), row.getSecondaryColor(), row.getBackgroundColor());
        // Fail safe on legacy/corrupt presentation data, without inventing another tenant's colors.
        if (!valid(palette)) palette = null;
        return new RestaurantBrandingResponse(restaurant.getId(), restaurant.getName(), safeLogo(restaurant.getLogoUrl()),
                palette, row == null ? 0 : row.getRevision());
    }

    private static String safeLogo(String value) {
        if (value == null || value.length() > 2000) return null;
        try {
            URI uri = URI.create(value);
            return "https".equalsIgnoreCase(uri.getScheme()) && uri.getHost() != null
                    && uri.getRawUserInfo() == null && uri.getRawFragment() == null
                    && (uri.getRawQuery() == null || uri.getRawQuery().matches(
                            "v=[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"))
                    ? value : null;
        } catch (IllegalArgumentException exception) {
            return null;
        }
    }

    private ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "RESTAURANT_NOT_FOUND", "error.restaurant.not-found");
    }
}
