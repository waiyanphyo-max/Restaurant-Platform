package com.restaurant.platform.controller;

import com.restaurant.platform.dto.notification.NotificationResponse;
import com.restaurant.platform.service.RestaurantNotificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/restaurants/{restaurantId}/notifications")
@RequiredArgsConstructor
public class RestaurantNotificationController {
    private final RestaurantNotificationService service;

    @GetMapping
    public List<NotificationResponse> list(@PathVariable UUID restaurantId, @RequestParam(required = false) String status) {
        return service.list(restaurantId, status);
    }

    @PatchMapping("/{notificationId}/read")
    public NotificationResponse markRead(@PathVariable UUID restaurantId, @PathVariable UUID notificationId) {
        return service.markRead(restaurantId, notificationId);
    }
}
