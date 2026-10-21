package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.settings.RestaurantSettingsRequest;
import com.restaurant.platform.entity.RestaurantSettings;
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

class RestaurantSettingsServiceTest {
    private RestaurantSettingsRepository repository;
    private RestaurantAuthorization authorization;
    private RestaurantSettingsService service;
    private final UUID restaurantId = UUID.randomUUID();
    private final UUID userId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        repository = mock(RestaurantSettingsRepository.class);
        authorization = mock(RestaurantAuthorization.class);
        service = new RestaurantSettingsService(repository, authorization);
    }

    @Test
    void updateSettingsRejectsInvalidTimezoneBeforeSaving() {
        when(repository.findById(restaurantId)).thenReturn(Optional.of(settings()));
        ApiException error = assertThrows(ApiException.class,
                () -> service.updateSettings(restaurantId, userId,
                        new RestaurantSettingsRequest(
                                "MMK", "Not/A_Timezone", 0L, 100L,
                                true, true, true, true)));
        assertEquals("INVALID_RESTAURANT_TIMEZONE", error.getCode());
        assertEquals(HttpStatus.BAD_REQUEST, error.getStatus());
        verify(repository, never()).save(any(RestaurantSettings.class));
    }

    @Test
    void validSettingsAreSavedWithoutExposingCommonQrTokenInResponse() {
        RestaurantSettings settings = settings();
        when(repository.findById(restaurantId)).thenReturn(Optional.of(settings));
        when(repository.save(any(RestaurantSettings.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        var response = service.updateSettings(restaurantId, userId,
                new RestaurantSettingsRequest("mmk", "Asia/Yangon", 500L, 1000L,
                        true, true, false, true));

        assertEquals("MMK", response.currency());
        assertEquals(500L, response.minimumOrder());
        assertEquals(1000L, response.defaultDeliveryFee());
        assertFalse(response.allowDelivery());
        assertEquals(restaurantId, response.restaurantId());
        verify(authorization).requirePermission(restaurantId, RestaurantPermission.SETTINGS_MANAGE);
    }

    @Test
    void commonQrTokenRotationReturnsNewTokenOnceAndPersistsIt() {
        RestaurantSettings settings = settings();
        when(repository.findById(restaurantId)).thenReturn(Optional.of(settings));
        when(repository.save(any(RestaurantSettings.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        String oldToken = settings.getCommonQrToken();

        var response = service.rotateCommonQrToken(restaurantId, userId);

        assertEquals(64, response.commonQrToken().length());
        assertNotEquals(oldToken, response.commonQrToken());
        assertEquals(response.commonQrToken(), settings.getCommonQrToken());
        verify(repository).save(settings);
    }

    private RestaurantSettings settings() {
        RestaurantSettings settings = new RestaurantSettings();
        settings.setRestaurantId(restaurantId);
        settings.setCommonQrToken("A".repeat(64));
        settings.setCurrency("MMK");
        settings.setTimezone("Asia/Yangon");
        settings.setMinimumOrder(0L);
        settings.setDefaultDeliveryFee(0L);
        settings.setAcceptsOrders(true);
        settings.setAllowQrOrder(true);
        settings.setAllowDelivery(true);
        settings.setAllowTakeaway(true);
        return settings;
    }
}
