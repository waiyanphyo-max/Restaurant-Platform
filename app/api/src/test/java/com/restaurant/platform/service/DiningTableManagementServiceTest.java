package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.table.DiningTableRequest;
import com.restaurant.platform.entity.DiningTable;
import com.restaurant.platform.entity.RestaurantSettings;
import com.restaurant.platform.repository.DiningTableRepository;
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

class DiningTableManagementServiceTest {
    private DiningTableRepository tableRepository;
    private RestaurantSettingsRepository settingsRepository;
    private RestaurantAuthorization authorization;
    private DiningTableManagementService service;
    private final UUID restaurantId = UUID.randomUUID();
    private final UUID userId = UUID.randomUUID();
    private final UUID tableId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        tableRepository = mock(DiningTableRepository.class);
        settingsRepository = mock(RestaurantSettingsRepository.class);
        authorization = mock(RestaurantAuthorization.class);
        service = new DiningTableManagementService(
                tableRepository, settingsRepository, authorization);
    }

    @Test
    void createTableReturnsRandomQrTokenButNormalResponseDoesNotContainIt() {
        when(settingsRepository.findById(restaurantId)).thenReturn(Optional.of(new RestaurantSettings()));
        when(tableRepository.findByRestaurantIdAndTableNumber(restaurantId, "T1"))
                .thenReturn(Optional.empty());
        when(tableRepository.save(any(DiningTable.class))).thenAnswer(invocation -> {
            DiningTable table = invocation.getArgument(0);
            table.setId(tableId);
            return table;
        });

        var response = service.create(restaurantId, userId,
                new DiningTableRequest("T1", true));

        assertEquals(tableId, response.tableId());
        assertEquals("T1", response.tableNumber());
        assertEquals(64, response.qrToken().length());
        var captor = org.mockito.ArgumentCaptor.forClass(DiningTable.class);
        verify(tableRepository).save(captor.capture());
        assertEquals(response.qrToken(), captor.getValue().getQrToken());
        verify(authorization).requirePermission(restaurantId, RestaurantPermission.SETTINGS_MANAGE);
    }

    @Test
    void createRejectsDuplicateTableNumber() {
        DiningTable existing = new DiningTable();
        existing.setId(UUID.randomUUID());
        when(settingsRepository.findById(restaurantId)).thenReturn(Optional.of(new RestaurantSettings()));
        when(tableRepository.findByRestaurantIdAndTableNumber(restaurantId, "T1"))
                .thenReturn(Optional.of(existing));

        ApiException error = assertThrows(ApiException.class,
                () -> service.create(restaurantId, userId,
                        new DiningTableRequest("T1", true)));

        assertEquals("DINING_TABLE_EXISTS", error.getCode());
        assertEquals(HttpStatus.CONFLICT, error.getStatus());
        verify(tableRepository, never()).save(any(DiningTable.class));
    }

    @Test
    void updateCannotModifyTableFromAnotherRestaurant() {
        when(tableRepository.findByIdAndRestaurantId(tableId, restaurantId))
                .thenReturn(Optional.empty());

        ApiException error = assertThrows(ApiException.class,
                () -> service.update(restaurantId, userId, tableId,
                        new DiningTableRequest("T2", false)));

        assertEquals("DINING_TABLE_NOT_FOUND", error.getCode());
        verify(tableRepository, never()).save(any(DiningTable.class));
    }

    @Test
    void rotatingQrTokenInvalidatesOldValue() {
        DiningTable table = new DiningTable();
        table.setId(tableId);
        table.setRestaurantId(restaurantId);
        table.setTableNumber("T1");
        table.setQrToken("B".repeat(64));
        when(tableRepository.findByIdAndRestaurantId(tableId, restaurantId))
                .thenReturn(Optional.of(table));
        when(tableRepository.save(any(DiningTable.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        String oldToken = table.getQrToken();

        var response = service.rotateQrToken(restaurantId, userId, tableId);

        assertNotEquals(oldToken, response.qrToken());
        assertEquals(response.qrToken(), table.getQrToken());
        verify(tableRepository).save(table);
    }
}
