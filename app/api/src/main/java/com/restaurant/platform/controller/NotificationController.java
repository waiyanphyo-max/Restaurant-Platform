package com.restaurant.platform.controller;

import com.restaurant.platform.dto.notification.NotificationResponse;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.service.NotificationService;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/notifications")
@RequiredArgsConstructor
public class NotificationController {

    private final NotificationService notificationService;
    private final RestaurantAuthorization restaurantAuthorization;

    @GetMapping
    public List<NotificationResponse> listMyNotifications(
            @RequestParam(required = false) String status) {
        UUID userId = restaurantAuthorization.requireAuthenticatedUserId();
        return notificationService.listForUser(userId, status);
    }

    @PatchMapping("/{notificationId}/read")
    public NotificationResponse markMyNotificationRead(
            @PathVariable UUID notificationId) {
        UUID userId = restaurantAuthorization.requireAuthenticatedUserId();
        return notificationService.markReadForUser(userId, notificationId);
    }
}
