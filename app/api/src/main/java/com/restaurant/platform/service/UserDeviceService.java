package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.device.RegisterDeviceRequest;
import com.restaurant.platform.dto.device.UserDeviceResponse;
import com.restaurant.platform.entity.UserDevice;
import com.restaurant.platform.repository.RestaurantRepository;
import com.restaurant.platform.repository.UserDeviceRepository;
import com.restaurant.platform.security.RestaurantAuthorization;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Service
public class UserDeviceService {

    private final UserDeviceRepository deviceRepository;
    private final RestaurantAuthorization authorization;
    private final RestaurantRepository restaurants;

    public UserDeviceService(
            UserDeviceRepository deviceRepository,
            RestaurantAuthorization authorization,
            RestaurantRepository restaurants) {
        this.deviceRepository = deviceRepository;
        this.authorization = authorization;
        this.restaurants = restaurants;
    }

    @Transactional(readOnly = true)
    public List<UserDeviceResponse> listMyDevices(UUID userId) {
        authorization.requireAuthenticatedUserMatches(userId);
        return deviceRepository.findByUserIdOrderByCreatedAtDesc(userId)
                .stream().map(this::toResponse).toList();
    }

    @Transactional
    public UserDeviceResponse register(UUID userId, RegisterDeviceRequest request) {
        authorization.requireAuthenticatedUserMatches(userId);
        return registerDevice(null, userId, request);
    }

    @Transactional
    public UserDeviceResponse registerCustomerDevice(UUID restaurantId, UUID userId, RegisterDeviceRequest request) {
        authorization.requireAuthenticatedUserMatches(userId);
        restaurants.findByIdAndIsActiveTrue(restaurantId).orElseThrow(() -> new ApiException(
                HttpStatus.NOT_FOUND, "RESTAURANT_NOT_FOUND", "error.restaurant.not-found"));
        return registerDevice(restaurantId, userId, request);
    }

    private UserDeviceResponse registerDevice(UUID restaurantId, UUID userId, RegisterDeviceRequest request) {
        if (request == null || request.pushToken() == null || request.pushToken().isBlank()
                || request.platform() == null || request.platform().isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "INVALID_DEVICE_REGISTRATION", "error.device.invalid-registration");
        }

        String pushToken = request.pushToken().trim();
        String platform = request.platform().trim().toUpperCase(Locale.ROOT);
        if (!List.of("ANDROID", "IOS", "WEB").contains(platform)
                || (restaurantId != null && !"ANDROID".equals(platform))) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "INVALID_DEVICE_PLATFORM", "error.device.invalid-platform");
        }
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);

        UserDevice device = deviceRepository.findByPushToken(pushToken).orElse(null);
        if (device != null) {
            if (!userId.equals(device.getUserId())) {
                throw new ApiException(HttpStatus.CONFLICT,
                        "PUSH_TOKEN_IN_USE", "error.device.token-in-use");
            }
            UUID existingRestaurant = device.getCustomerRestaurantId();
            if (existingRestaurant != null
                    && ((restaurantId != null && !existingRestaurant.equals(restaurantId)) || !"ANDROID".equals(platform))) {
                throw new ApiException(HttpStatus.CONFLICT,
                        "PUSH_TOKEN_IN_USE", "error.device.token-in-use");
            }
            if (restaurantId != null) {
                device.setCustomerRestaurantId(restaurantId);
            }
            device.setPlatform(platform);
            device.setIsActive(true);
            device.setLastSeenAt(now);
            return toResponse(deviceRepository.save(device));
        }

        device = new UserDevice();
        device.setUserId(userId);
        device.setCustomerRestaurantId(restaurantId);
        device.setPushToken(pushToken);
        device.setPlatform(platform);
        device.setIsActive(true);
        device.setLastSeenAt(now);
        return toResponse(deviceRepository.save(device));
    }

    @Transactional
    public void deactivate(UUID userId, UUID deviceId) {
        authorization.requireAuthenticatedUserMatches(userId);
        deactivate(deviceRepository.findByIdAndUserId(deviceId, userId).orElseThrow(this::deviceNotFound));
    }

    @Transactional
    public void deactivateCustomerDevice(UUID restaurantId, UUID userId, UUID deviceId) {
        authorization.requireAuthenticatedUserMatches(userId);
        // Includes owned, unscoped Android IDs saved by the M11 app before upgrading.
        deactivate(deviceRepository.findCustomerAndroidDevice(restaurantId, userId, deviceId)
                .orElseThrow(this::deviceNotFound));
    }

    private void deactivate(UserDevice device) {
        device.setIsActive(false);
        deviceRepository.save(device);
    }

    private ApiException deviceNotFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "USER_DEVICE_NOT_FOUND", "error.device.not-found");
    }

    private UserDeviceResponse toResponse(UserDevice device) {
        // Push tokens are secrets and are intentionally never returned to callers.
        return new UserDeviceResponse(
                device.getId(), device.getPlatform(),
                Boolean.TRUE.equals(device.getIsActive()),
                device.getLastSeenAt(), device.getCreatedAt());
    }
}
