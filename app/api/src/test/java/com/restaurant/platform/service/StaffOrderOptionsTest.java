package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.order.StaffOrderOptions;
import com.restaurant.platform.entity.DiningTable;
import com.restaurant.platform.entity.Restaurant;
import com.restaurant.platform.entity.RestaurantSettings;
import com.restaurant.platform.repository.DiningTableRepository;
import com.restaurant.platform.repository.RestaurantRepository;
import com.restaurant.platform.repository.RestaurantSettingsRepository;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.security.RestaurantPermission;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class StaffOrderOptionsTest {
    private final UUID restaurantId = UUID.randomUUID();

    @Mock RestaurantAuthorization authorization;
    @Mock RestaurantRepository restaurants;
    @Mock RestaurantSettingsRepository settings;
    @Mock DiningTableRepository tables;
    @InjectMocks OrderService service;

    @Test
    void requiresOrderCreateForTheRequestedRestaurantBeforeReadingOptions() {
        doThrow(new ApiException(HttpStatus.FORBIDDEN, "DENIED", "error.authorization.permission_denied"))
                .when(authorization).requirePermission(restaurantId, RestaurantPermission.ORDER_CREATE);

        assertEquals(HttpStatus.FORBIDDEN,
                assertThrows(ApiException.class, () -> service.getStaffOrderOptions(restaurantId)).getStatus());
        verifyNoInteractions(restaurants, settings, tables);
    }

    @Test
    void returnsOnlyTableLabelsAndIdsWithAvailableOrderTypes() {
        RestaurantSettings enabled = new RestaurantSettings();
        enabled.setAllowTakeaway(false);
        givenSettings(enabled);
        DiningTable first = table("A1");
        DiningTable second = table("B2");
        when(tables.findByRestaurantIdAndIsActiveTrue(restaurantId)).thenReturn(List.of(second, first));

        assertEquals(new StaffOrderOptions(true, false, List.of(
                new StaffOrderOptions.Table(first.getId(), "A1"),
                new StaffOrderOptions.Table(second.getId(), "B2"))), service.getStaffOrderOptions(restaurantId));
    }

    @Test
    void allowsTakeawayWhenThereAreNoActiveTables() {
        givenSettings(new RestaurantSettings());
        when(tables.findByRestaurantIdAndIsActiveTrue(restaurantId)).thenReturn(List.of());

        assertEquals(new StaffOrderOptions(false, true, List.of()), service.getStaffOrderOptions(restaurantId));
    }

    @Test
    void hidesOrderTypesWhenRestaurantHasPausedOrders() {
        RestaurantSettings paused = new RestaurantSettings();
        paused.setAcceptsOrders(false);
        givenSettings(paused);

        assertEquals(new StaffOrderOptions(false, false, List.of()), service.getStaffOrderOptions(restaurantId));
        verifyNoInteractions(tables);
    }

    private void givenSettings(RestaurantSettings value) {
        when(restaurants.findByIdAndIsActiveTrue(restaurantId)).thenReturn(Optional.of(new Restaurant()));
        when(settings.findById(restaurantId)).thenReturn(Optional.of(value));
    }

    private static DiningTable table(String label) {
        DiningTable table = new DiningTable();
        table.setId(UUID.randomUUID());
        table.setTableNumber(label);
        table.setQrToken("private-qr-token");
        return table;
    }
}
