package com.restaurant.platform.controller;

import com.restaurant.platform.dto.notification.NotificationResponse;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.service.NotificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/customer/restaurants/{restaurantId}/notifications")
@RequiredArgsConstructor
public class CustomerNotificationController {
    private final NotificationService notifications;
    private final RestaurantAuthorization authorization;

    @GetMapping
    public ResponseEntity<List<NotificationResponse>> list(
            @PathVariable UUID restaurantId, @RequestParam(required = false) String status) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(
                notifications.listCustomerDeliveryNotifications(restaurantId, authorization.requireAuthenticatedUserId(), status));
    }

    @PatchMapping("/{notificationId}/read")
    public ResponseEntity<NotificationResponse> markRead(
            @PathVariable UUID restaurantId, @PathVariable UUID notificationId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(
                notifications.markCustomerDeliveryNotificationRead(
                        restaurantId, authorization.requireAuthenticatedUserId(), notificationId));
    }
}
