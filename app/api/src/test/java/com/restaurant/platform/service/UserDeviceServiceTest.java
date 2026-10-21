package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.device.RegisterDeviceRequest;
import com.restaurant.platform.entity.UserDevice;
import com.restaurant.platform.repository.UserDeviceRepository;
import com.restaurant.platform.security.RestaurantAuthorization;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class UserDeviceServiceTest {

    private UserDeviceRepository repository;
    private RestaurantAuthorization authorization;
    private UserDeviceService service;
    private final UUID userId = UUID.randomUUID();
    private final UUID otherUserId = UUID.randomUUID();
    private final UUID deviceId = UUID.randomUUID();
    private final String token = "opaque-push-token-from-provider";

    @BeforeEach
    void setUp() {
        repository = mock(UserDeviceRepository.class);
        authorization = mock(RestaurantAuthorization.class);
        service = new UserDeviceService(repository, authorization);
    }

    @Test
    void registerCreatesDeviceButNeverReturnsPushToken() {
        when(repository.findByPushToken(token)).thenReturn(Optional.empty());
        when(repository.save(any(UserDevice.class))).thenAnswer(invocation -> {
            UserDevice device = invocation.getArgument(0);
            device.setId(deviceId);
            return device;
        });

        var response = service.register(userId, new RegisterDeviceRequest(token, "ANDROID"));

        assertEquals(deviceId, response.id());
        assertEquals("ANDROID", response.platform());
        assertTrue(response.active());
        assertFalse(response.toString().contains(token));
        var captor = org.mockito.ArgumentCaptor.forClass(UserDevice.class);
        verify(repository).save(captor.capture());
        assertEquals(userId, captor.getValue().getUserId());
        assertEquals(token, captor.getValue().getPushToken());
        verify(authorization).requireAuthenticatedUserMatches(userId);
    }

    @Test
    void sameUsersTokenRegistrationReactivatesExistingDevice() {
        UserDevice existing = device(userId);
        existing.setIsActive(false);
        when(repository.findByPushToken(token)).thenReturn(Optional.of(existing));
        when(repository.save(any(UserDevice.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var response = service.register(userId, new RegisterDeviceRequest(token, "WEB"));

        assertTrue(response.active());
        assertEquals("WEB", response.platform());
        assertNotNull(response.lastSeenAt());
        verify(repository).save(existing);
    }

    @Test
    void tokenAlreadyOwnedByAnotherUserIsRejected() {
        UserDevice existing = device(otherUserId);
        when(repository.findByPushToken(token)).thenReturn(Optional.of(existing));

        ApiException error = assertThrows(ApiException.class,
                () -> service.register(userId, new RegisterDeviceRequest(token, "IOS")));

        assertEquals("PUSH_TOKEN_IN_USE", error.getCode());
        assertEquals(HttpStatus.CONFLICT, error.getStatus());
        verify(repository, never()).save(any(UserDevice.class));
    }

    @Test
    void deactivationIsScopedToAuthenticatedOwner() {
        when(repository.findByIdAndUserId(deviceId, userId)).thenReturn(Optional.empty());

        ApiException error = assertThrows(ApiException.class,
                () -> service.deactivate(userId, deviceId));

        assertEquals("USER_DEVICE_NOT_FOUND", error.getCode());
        assertEquals(HttpStatus.NOT_FOUND, error.getStatus());
        verify(repository, never()).save(any(UserDevice.class));
    }

    @Test
    void listReturnsOnlyOwnDeviceMetadataWithoutTokens() {
        UserDevice device = device(userId);
        when(repository.findByUserIdOrderByCreatedAtDesc(userId)).thenReturn(List.of(device));

        var response = service.listMyDevices(userId);

        assertEquals(1, response.size());
        assertEquals("ANDROID", response.getFirst().platform());
        assertFalse(response.getFirst().toString().contains(token));
        verify(repository).findByUserIdOrderByCreatedAtDesc(userId);
    }

    private UserDevice device(UUID ownerId) {
        UserDevice device = new UserDevice();
        device.setId(deviceId);
        device.setUserId(ownerId);
        device.setPushToken(token);
        device.setPlatform("ANDROID");
        device.setIsActive(true);
        return device;
    }
}
