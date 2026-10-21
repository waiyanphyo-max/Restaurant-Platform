package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.table.DiningTableQrTokenResponse;
import com.restaurant.platform.dto.table.DiningTableRequest;
import com.restaurant.platform.dto.table.DiningTableResponse;
import com.restaurant.platform.entity.DiningTable;
import com.restaurant.platform.repository.DiningTableRepository;
import com.restaurant.platform.repository.RestaurantSettingsRepository;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.security.RestaurantPermission;
import com.restaurant.platform.security.TokenUtils;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class DiningTableManagementService {

    private final DiningTableRepository tableRepository;
    private final RestaurantSettingsRepository settingsRepository;
    private final RestaurantAuthorization authorization;

    public DiningTableManagementService(
            DiningTableRepository tableRepository,
            RestaurantSettingsRepository settingsRepository,
            RestaurantAuthorization authorization) {
        this.tableRepository = tableRepository;
        this.settingsRepository = settingsRepository;
        this.authorization = authorization;
    }

    @Transactional(readOnly = true)
    public List<DiningTableResponse> list(UUID restaurantId, UUID userId) {
        requireManagePermission(restaurantId, userId);
        return tableRepository.findByRestaurantIdOrderByTableNumberAsc(restaurantId)
                .stream().map(this::toResponse).toList();
    }

    @Transactional
    public DiningTableQrTokenResponse create(
            UUID restaurantId, UUID userId, DiningTableRequest request) {
        requireManagePermission(restaurantId, userId);
        validate(request);
        requireSettings(restaurantId);
        String tableNumber = request.tableNumber().trim();
        if (tableRepository.findByRestaurantIdAndTableNumber(restaurantId, tableNumber).isPresent()) {
            throw new ApiException(HttpStatus.CONFLICT,
                    "DINING_TABLE_EXISTS", "error.table.already-exists");
        }

        DiningTable table = new DiningTable();
        table.setRestaurantId(restaurantId);
        table.setTableNumber(tableNumber);
        table.setQrToken(TokenUtils.generateToken());
        table.setIsActive(request.active() == null || request.active());
        table = tableRepository.save(table);
        // Return the raw token only once; list/detail DTOs never contain it.
        return new DiningTableQrTokenResponse(table.getId(), table.getTableNumber(), table.getQrToken());
    }

    @Transactional
    public DiningTableResponse update(
            UUID restaurantId, UUID userId, UUID tableId, DiningTableRequest request) {
        requireManagePermission(restaurantId, userId);
        validate(request);
        DiningTable table = tableRepository.findByIdAndRestaurantId(tableId, restaurantId)
                .orElseThrow(this::tableNotFound);
        String tableNumber = request.tableNumber().trim();
        tableRepository.findByRestaurantIdAndTableNumber(restaurantId, tableNumber)
                .filter(existing -> !existing.getId().equals(tableId))
                .ifPresent(existing -> {
                    throw new ApiException(HttpStatus.CONFLICT,
                            "DINING_TABLE_EXISTS", "error.table.already-exists");
                });
        table.setTableNumber(tableNumber);
        if (request.active() != null) {
            table.setIsActive(request.active());
        }
        return toResponse(tableRepository.save(table));
    }

    @Transactional
    public DiningTableQrTokenResponse rotateQrToken(
            UUID restaurantId, UUID userId, UUID tableId) {
        requireManagePermission(restaurantId, userId);
        DiningTable table = tableRepository.findByIdAndRestaurantId(tableId, restaurantId)
                .orElseThrow(this::tableNotFound);
        table.setQrToken(TokenUtils.generateToken());
        tableRepository.save(table);
        return new DiningTableQrTokenResponse(table.getId(), table.getTableNumber(), table.getQrToken());
    }

    private void validate(DiningTableRequest request) {
        if (request == null || request.tableNumber() == null || request.tableNumber().isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "INVALID_DINING_TABLE", "error.table.invalid");
        }
    }

    private void requireManagePermission(UUID restaurantId, UUID userId) {
        authorization.requireAuthenticatedUserMatches(userId);
        authorization.requirePermission(restaurantId, RestaurantPermission.SETTINGS_MANAGE);
    }

    private void requireSettings(UUID restaurantId) {
        settingsRepository.findById(restaurantId)
                .orElseThrow(() -> new ApiException(HttpStatus.CONFLICT,
                        "RESTAURANT_SETTINGS_MISSING", "error.restaurant.settings-missing"));
    }

    private DiningTableResponse toResponse(DiningTable table) {
        return new DiningTableResponse(
                table.getId(), table.getRestaurantId(), table.getTableNumber(),
                Boolean.TRUE.equals(table.getIsActive()), table.getCreatedAt());
    }

    private ApiException tableNotFound() {
        return new ApiException(HttpStatus.NOT_FOUND,
                "DINING_TABLE_NOT_FOUND", "error.table.not-found");
    }
}
