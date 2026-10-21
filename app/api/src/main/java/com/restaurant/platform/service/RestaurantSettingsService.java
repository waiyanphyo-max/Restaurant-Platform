package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.settings.CommonQrTokenResponse;
import com.restaurant.platform.dto.settings.RestaurantSettingsRequest;
import com.restaurant.platform.dto.settings.RestaurantSettingsResponse;
import com.restaurant.platform.entity.RestaurantSettings;
import com.restaurant.platform.repository.RestaurantSettingsRepository;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.security.RestaurantPermission;
import com.restaurant.platform.security.TokenUtils;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DateTimeException;
import java.time.ZoneId;
import java.util.Locale;
import java.util.UUID;

@Service
public class RestaurantSettingsService {

    private final RestaurantSettingsRepository settingsRepository;
    private final RestaurantAuthorization authorization;

    public RestaurantSettingsService(
            RestaurantSettingsRepository settingsRepository,
            RestaurantAuthorization authorization) {
        this.settingsRepository = settingsRepository;
        this.authorization = authorization;
    }

    @Transactional(readOnly = true)
    public RestaurantSettingsResponse getSettings(UUID restaurantId, UUID userId) {
        requireSettingsPermission(restaurantId, userId);
        return toResponse(requireSettings(restaurantId));
    }

    @Transactional
    public RestaurantSettingsResponse updateSettings(
            UUID restaurantId, UUID userId, RestaurantSettingsRequest request) {
        requireSettingsPermission(restaurantId, userId);
        if (request == null || request.currency() == null || request.currency().isBlank()
                || request.timezone() == null || request.timezone().isBlank()
                || request.minimumOrder() == null || request.minimumOrder() < 0
                || request.defaultDeliveryFee() == null || request.defaultDeliveryFee() < 0
                || request.acceptsOrders() == null || request.allowQrOrder() == null
                || request.allowDelivery() == null || request.allowTakeaway() == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "INVALID_RESTAURANT_SETTINGS", "error.settings.invalid");
        }

        String timezone = request.timezone().trim();
        try {
            ZoneId.of(timezone);
        } catch (DateTimeException exception) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "INVALID_RESTAURANT_TIMEZONE",
                    "error.settings.invalid-timezone", timezone);
        }

        RestaurantSettings settings = requireSettings(restaurantId);
        settings.setCurrency(request.currency().trim().toUpperCase(Locale.ROOT));
        settings.setTimezone(timezone);
        settings.setMinimumOrder(request.minimumOrder());
        settings.setDefaultDeliveryFee(request.defaultDeliveryFee());
        settings.setAcceptsOrders(request.acceptsOrders());
        settings.setAllowQrOrder(request.allowQrOrder());
        settings.setAllowDelivery(request.allowDelivery());
        settings.setAllowTakeaway(request.allowTakeaway());
        return toResponse(settingsRepository.save(settings));
    }

    /**
     * Replaces the Common QR credential and returns the raw token only in this response.
     * The GET settings API never returns this secret.
     */
    @Transactional
    public CommonQrTokenResponse rotateCommonQrToken(UUID restaurantId, UUID userId) {
        requireSettingsPermission(restaurantId, userId);
        RestaurantSettings settings = requireSettings(restaurantId);
        String token = TokenUtils.generateToken();
        settings.setCommonQrToken(token);
        settingsRepository.save(settings);
        return new CommonQrTokenResponse(restaurantId, token);
    }

    private void requireSettingsPermission(UUID restaurantId, UUID userId) {
        authorization.requireAuthenticatedUserMatches(userId);
        authorization.requirePermission(restaurantId, RestaurantPermission.SETTINGS_MANAGE);
    }

    private RestaurantSettings requireSettings(UUID restaurantId) {
        return settingsRepository.findById(restaurantId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.CONFLICT,
                        "RESTAURANT_SETTINGS_MISSING",
                        "error.restaurant.settings-missing"));
    }

    private RestaurantSettingsResponse toResponse(RestaurantSettings settings) {
        return new RestaurantSettingsResponse(
                settings.getRestaurantId(), settings.getCurrency(), settings.getTimezone(),
                settings.getMinimumOrder(), settings.getDefaultDeliveryFee(),
                Boolean.TRUE.equals(settings.getAcceptsOrders()),
                Boolean.TRUE.equals(settings.getAllowQrOrder()),
                Boolean.TRUE.equals(settings.getAllowDelivery()),
                Boolean.TRUE.equals(settings.getAllowTakeaway()),
                settings.getDefaultDeliveryDriverUserId());
    }
}
