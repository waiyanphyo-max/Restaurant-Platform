package com.restaurant.platform.controller;

import com.restaurant.platform.dto.notification.NotificationResponse;
import com.restaurant.platform.dto.order.QueueTrackingResponse;
import com.restaurant.platform.service.QueueTrackingService;

import lombok.RequiredArgsConstructor;
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
     */
    @GetMapping("/status")
    public QueueTrackingResponse getStatus(
            @PathVariable UUID ticketId,
            @RequestHeader(name = "X-Queue-Token", required = false) String trackingToken) {
        return queueTrackingService.getStatus(ticketId, trackingToken);
    }

    @GetMapping("/notifications")
    public List<NotificationResponse> getNotifications(
            @PathVariable UUID ticketId,
            @RequestHeader(name = "X-Queue-Token", required = false) String trackingToken) {
        return queueTrackingService.getNotifications(ticketId, trackingToken);
    }

    @PatchMapping("/notifications/{notificationId}/read")
    public NotificationResponse markNotificationRead(
            @PathVariable UUID ticketId,
            @PathVariable UUID notificationId,
            @RequestHeader(name = "X-Queue-Token", required = false) String trackingToken) {
        return queueTrackingService.markNotificationRead(ticketId, notificationId, trackingToken);
    }
}
