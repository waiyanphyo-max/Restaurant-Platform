package com.restaurant.platform.controller;

import com.restaurant.platform.dto.notification.NotificationResponse;
import com.restaurant.platform.dto.order.QueueTrackingResponse;
import com.restaurant.platform.service.QueueTrackingService;

import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/public/queue-tickets/{ticketId}")
@RequiredArgsConstructor
public class QueueTrackingController {

    private final QueueTrackingService queueTrackingService;

    /**
     * Customer holds the unguessable tracking token returned by QR order creation.
     * Do not put that token into the URL, where it can be captured by URL logs.
     * Tenant-bound guest proxies also send X-Restaurant-Id. The optional scope is
     * checked before reading order/notification data; legacy token-only clients remain supported.
     */
    @GetMapping("/status")
    public ResponseEntity<QueueTrackingResponse> getStatus(
            @PathVariable UUID ticketId,
            @RequestHeader(name = "X-Queue-Token", required = false) String trackingToken,
            @RequestHeader(name = "X-Restaurant-Id", required = false) UUID restaurantId) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(queueTrackingService.getStatus(ticketId, trackingToken, restaurantId));
    }

    @GetMapping("/notifications")
    public ResponseEntity<List<NotificationResponse>> getNotifications(
            @PathVariable UUID ticketId,
            @RequestHeader(name = "X-Queue-Token", required = false) String trackingToken,
            @RequestHeader(name = "X-Restaurant-Id", required = false) UUID restaurantId) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(queueTrackingService.getNotifications(ticketId, trackingToken, restaurantId));
    }

    @PatchMapping("/notifications/{notificationId}/read")
    public ResponseEntity<NotificationResponse> markNotificationRead(
            @PathVariable UUID ticketId,
            @PathVariable UUID notificationId,
            @RequestHeader(name = "X-Queue-Token", required = false) String trackingToken,
            @RequestHeader(name = "X-Restaurant-Id", required = false) UUID restaurantId) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(queueTrackingService.markNotificationRead(ticketId, notificationId, trackingToken, restaurantId));
    }
}
