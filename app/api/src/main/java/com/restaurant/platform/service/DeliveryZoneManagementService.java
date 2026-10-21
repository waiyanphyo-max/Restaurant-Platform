package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.settings.DeliveryZoneRequest;
import com.restaurant.platform.dto.settings.DeliveryZoneResponse;
import com.restaurant.platform.entity.DeliveryZone;
import com.restaurant.platform.repository.DeliveryZoneRepository;
import com.restaurant.platform.repository.RestaurantSettingsRepository;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.security.RestaurantPermission;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class DeliveryZoneManagementService {

    private final DeliveryZoneRepository zoneRepository;
    private final RestaurantSettingsRepository settingsRepository;
    private final RestaurantAuthorization authorization;

    public DeliveryZoneManagementService(
            DeliveryZoneRepository zoneRepository,
            RestaurantSettingsRepository settingsRepository,
            RestaurantAuthorization authorization) {
        this.zoneRepository = zoneRepository;
        this.settingsRepository = settingsRepository;
        this.authorization = authorization;
    }

    @Transactional(readOnly = true)
    public List<DeliveryZoneResponse> list(UUID restaurantId, UUID userId) {
        requireSettingsPermission(restaurantId, userId);
        return zoneRepository.findByRestaurantIdOrderByNameAsc(restaurantId)
                .stream().map(this::toResponse).toList();
    }

    @Transactional
    public DeliveryZoneResponse create(
            UUID restaurantId, UUID userId, DeliveryZoneRequest request) {
        requireSettingsPermission(restaurantId, userId);
        validate(request);
        requireSettings(restaurantId);
        DeliveryZone zone = new DeliveryZone();
        zone.setRestaurantId(restaurantId);
        zone.setName(request.name().trim());
        zone.setDeliveryFee(request.deliveryFee());
        zone.setMinimumOrder(request.minimumOrder());
        zone.setIsActive(request.active() == null || request.active());
        return toResponse(zoneRepository.save(zone));
    }

    @Transactional
    public DeliveryZoneResponse update(
            UUID restaurantId, UUID userId, UUID zoneId, DeliveryZoneRequest request) {
        requireSettingsPermission(restaurantId, userId);
        validate(request);
        DeliveryZone zone = zoneRepository.findByIdAndRestaurantId(zoneId, restaurantId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "DELIVERY_ZONE_NOT_FOUND",
                        "error.delivery-zone.not-found"));
        zone.setName(request.name().trim());
        zone.setDeliveryFee(request.deliveryFee());
        zone.setMinimumOrder(request.minimumOrder());
        if (request.active() != null) {
            zone.setIsActive(request.active());
        }
        return toResponse(zoneRepository.save(zone));
    }

    private void validate(DeliveryZoneRequest request) {
        if (request == null || request.name() == null || request.name().isBlank()
                || request.deliveryFee() == null || request.deliveryFee() < 0
                || request.minimumOrder() == null || request.minimumOrder() < 0) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "INVALID_DELIVERY_ZONE", "error.delivery-zone.invalid");
        }
    }

    private void requireSettingsPermission(UUID restaurantId, UUID userId) {
        authorization.requireAuthenticatedUserMatches(userId);
        authorization.requirePermission(restaurantId, RestaurantPermission.SETTINGS_MANAGE);
    }

    private void requireSettings(UUID restaurantId) {
        settingsRepository.findById(restaurantId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.CONFLICT,
                        "RESTAURANT_SETTINGS_MISSING",
                        "error.restaurant.settings-missing"));
    }

    private DeliveryZoneResponse toResponse(DeliveryZone zone) {
        return new DeliveryZoneResponse(
                zone.getId(), zone.getRestaurantId(), zone.getName(),
                zone.getDeliveryFee(), zone.getMinimumOrder(),
                Boolean.TRUE.equals(zone.getIsActive()));
    }
}
