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
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/restaurants/{restaurantId}/deliveries")
@RequiredArgsConstructor
public class DeliveryController {

    private final DeliveryService deliveryService;
    private final RestaurantAuthorization authorization;

    @GetMapping
    public ResponseEntity<Page<DeliveryTaskDto>> listDeliveries(
            @PathVariable UUID restaurantId,
            @RequestParam(required = false) String status,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC)
            Pageable pageable) {
        return noStore(deliveryService.listRestaurantDeliveries(restaurantId, status, pageable));
    }

    @GetMapping("/mine")
    public ResponseEntity<Page<DeliveryTaskDto>> listMyDeliveries(
            @PathVariable UUID restaurantId,
            @RequestParam(required = false) String status,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC)
            Pageable pageable) {
        return noStore(deliveryService.listMyDeliveries(restaurantId, status, pageable));
    }

    @GetMapping("/{deliveryId}")
    public ResponseEntity<DeliveryTaskDto> getDelivery(
            @PathVariable UUID restaurantId,
            @PathVariable UUID deliveryId) {
        return noStore(deliveryService.getDelivery(restaurantId, deliveryId));
    }

    @PatchMapping("/{deliveryId}/assign")
    public ResponseEntity<DeliveryTaskDto> assignDriver(
            @PathVariable UUID restaurantId,
            @PathVariable UUID deliveryId,
            @Valid @RequestBody AssignDeliveryDriverRequest request) {
        UUID actorUserId = authorization.requireAuthenticatedUserId();
        return noStore(deliveryService.assignDriver(restaurantId, deliveryId, actorUserId, request));
    }

    @PatchMapping("/{deliveryId}/status")
    public ResponseEntity<DeliveryTaskDto> updateStatus(
            @PathVariable UUID restaurantId,
            @PathVariable UUID deliveryId,
            @Valid @RequestBody UpdateDeliveryStatusRequest request) {
        UUID actorUserId = authorization.requireAuthenticatedUserId();
        return noStore(deliveryService.updateDeliveryStatus(restaurantId, deliveryId, actorUserId, request));
    }

    private static <T> ResponseEntity<T> noStore(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }
}
