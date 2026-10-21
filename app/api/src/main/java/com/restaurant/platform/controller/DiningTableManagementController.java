package com.restaurant.platform.controller;

import com.restaurant.platform.dto.table.DiningTableQrTokenResponse;
import com.restaurant.platform.dto.table.DiningTableRequest;
import com.restaurant.platform.dto.table.DiningTableResponse;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.service.DiningTableManagementService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/restaurants/{restaurantId}/tables")
@RequiredArgsConstructor
public class DiningTableManagementController {

    private final DiningTableManagementService tableService;
    private final RestaurantAuthorization authorization;

    @GetMapping
    public List<DiningTableResponse> list(@PathVariable UUID restaurantId) {
        return tableService.list(restaurantId, authorization.requireAuthenticatedUserId());
    }

    @PostMapping
    public DiningTableQrTokenResponse create(
            @PathVariable UUID restaurantId,
            @Valid @RequestBody DiningTableRequest request) {
        return tableService.create(
                restaurantId, authorization.requireAuthenticatedUserId(), request);
    }

    @PutMapping("/{tableId}")
    public DiningTableResponse update(
            @PathVariable UUID restaurantId,
            @PathVariable UUID tableId,
            @Valid @RequestBody DiningTableRequest request) {
        return tableService.update(
                restaurantId, authorization.requireAuthenticatedUserId(), tableId, request);
    }

    @PostMapping("/{tableId}/qr-token/rotate")
    public DiningTableQrTokenResponse rotateQrToken(
            @PathVariable UUID restaurantId,
            @PathVariable UUID tableId) {
        return tableService.rotateQrToken(
                restaurantId, authorization.requireAuthenticatedUserId(), tableId);
    }
}
