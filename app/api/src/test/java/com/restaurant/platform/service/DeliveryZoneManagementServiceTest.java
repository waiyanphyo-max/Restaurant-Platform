package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.settings.DeliveryZoneRequest;
import com.restaurant.platform.entity.DeliveryZone;
import com.restaurant.platform.entity.RestaurantSettings;
import com.restaurant.platform.repository.DeliveryZoneRepository;
import com.restaurant.platform.repository.RestaurantSettingsRepository;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.security.RestaurantPermission;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import java.util.Optional;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class DeliveryZoneManagementServiceTest {
    private DeliveryZoneRepository zoneRepository;
    private RestaurantSettingsRepository settingsRepository;
    private RestaurantAuthorization authorization;
    private DeliveryZoneManagementService service;
    private final UUID restaurantId = UUID.randomUUID();
    private final UUID userId = UUID.randomUUID();
    private final UUID zoneId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        zoneRepository = mock(DeliveryZoneRepository.class);
        settingsRepository = mock(RestaurantSettingsRepository.class);
        authorization = mock(RestaurantAuthorization.class);
        service = new DeliveryZoneManagementService(
                zoneRepository, settingsRepository, authorization);
    }

    @Test
    void createZoneRequiresExistingSettingsAndDefaultsActive() {
        when(settingsRepository.findById(restaurantId)).thenReturn(Optional.of(new RestaurantSettings()));
        when(zoneRepository.save(any(DeliveryZone.class)))
                .thenAnswer(invocation -> {
                    DeliveryZone zone = invocation.getArgument(0);
                    zone.setId(zoneId);
                    return zone;
                });

        var response = service.create(restaurantId, userId,
                new DeliveryZoneRequest("Nearby", 500L, 1000L, null));

        assertEquals(zoneId, response.id());
        assertEquals(restaurantId, response.restaurantId());
        assertTrue(response.active());
        assertEquals(500L, response.deliveryFee());
        verify(authorization).requirePermission(restaurantId, RestaurantPermission.SETTINGS_MANAGE);
    }

    @Test
    void updateCannotModifyZoneFromAnotherRestaurant() {
        when(zoneRepository.findByIdAndRestaurantId(zoneId, restaurantId))
                .thenReturn(Optional.empty());

        ApiException error = assertThrows(ApiException.class,
                () -> service.update(restaurantId, userId, zoneId,
                        new DeliveryZoneRequest("Another", 0L, 0L, false)));

        assertEquals("DELIVERY_ZONE_NOT_FOUND", error.getCode());
        assertEquals(HttpStatus.NOT_FOUND, error.getStatus());
        verify(zoneRepository, never()).save(any(DeliveryZone.class));
    }

    @Test
    void negativeFeesAreRejected() {
        ApiException error = assertThrows(ApiException.class,
                () -> service.create(restaurantId, userId,
                        new DeliveryZoneRequest("Nearby", -1L, 0L, true)));

        assertEquals("INVALID_DELIVERY_ZONE", error.getCode());
        verify(settingsRepository, never()).findById(restaurantId);
        verify(zoneRepository, never()).save(any(DeliveryZone.class));
    }
}
