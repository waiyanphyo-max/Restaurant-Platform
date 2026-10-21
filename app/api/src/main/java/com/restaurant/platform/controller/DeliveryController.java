package com.restaurant.platform.controller;

import com.restaurant.platform.dto.delivery.AssignDeliveryDriverRequest;
import com.restaurant.platform.dto.delivery.DeliveryTaskDto;
import com.restaurant.platform.dto.delivery.UpdateDeliveryStatusRequest;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.service.DeliveryService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/restaurants/{restaurantId}/deliveries")
@RequiredArgsConstructor
public class DeliveryController {

    private final DeliveryService deliveryService;
    private final RestaurantAuthorization authorization;

    @GetMapping
    public Page<DeliveryTaskDto> listDeliveries(
            @PathVariable UUID restaurantId,
            @RequestParam(required = false) String status,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC)
            Pageable pageable) {
        return deliveryService.listRestaurantDeliveries(restaurantId, status, pageable);
    }

    @GetMapping("/mine")
    public Page<DeliveryTaskDto> listMyDeliveries(
            @PathVariable UUID restaurantId,
            @RequestParam(required = false) String status,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC)
            Pageable pageable) {
        return deliveryService.listMyDeliveries(restaurantId, status, pageable);
    }

    @GetMapping("/{deliveryId}")
    public DeliveryTaskDto getDelivery(
            @PathVariable UUID restaurantId,
            @PathVariable UUID deliveryId) {
        return deliveryService.getDelivery(restaurantId, deliveryId);
    }

    @PatchMapping("/{deliveryId}/assign")
    public DeliveryTaskDto assignDriver(
            @PathVariable UUID restaurantId,
            @PathVariable UUID deliveryId,
            @Valid @RequestBody AssignDeliveryDriverRequest request) {
        UUID actorUserId = authorization.requireAuthenticatedUserId();
        return deliveryService.assignDriver(
                restaurantId, deliveryId, actorUserId, request);
    }

    @PatchMapping("/{deliveryId}/status")
    @ResponseStatus(HttpStatus.OK)
    public DeliveryTaskDto updateStatus(
            @PathVariable UUID restaurantId,
            @PathVariable UUID deliveryId,
            @Valid @RequestBody UpdateDeliveryStatusRequest request) {
        UUID actorUserId = authorization.requireAuthenticatedUserId();
        return deliveryService.updateDeliveryStatus(
                restaurantId, deliveryId, actorUserId, request);
    }
}
