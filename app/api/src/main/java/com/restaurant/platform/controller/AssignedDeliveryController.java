package com.restaurant.platform.controller;

import com.restaurant.platform.dto.delivery.AssignedDeliveryDetailDto;
import com.restaurant.platform.service.AssignedDeliveryService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/restaurants/{restaurantId}/deliveries/mine")
@RequiredArgsConstructor
public class AssignedDeliveryController {
    private final AssignedDeliveryService assignedDeliveryService;

    @GetMapping("/{deliveryId}")
    public ResponseEntity<AssignedDeliveryDetailDto> getDetail(
            @PathVariable UUID restaurantId, @PathVariable UUID deliveryId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(assignedDeliveryService.getDetail(restaurantId, deliveryId));
    }
}
