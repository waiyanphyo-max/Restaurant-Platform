package com.restaurant.platform.service;

import com.restaurant.platform.entity.AppNotification;
import com.restaurant.platform.entity.Order;
import com.restaurant.platform.repository.AppNotificationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Set;

/** Writes customer-facing delivery updates in the transaction that changed the order. */
@Service
@RequiredArgsConstructor
public class CustomerOrderNotifications {

    static final Set<String> TYPES = Set.of(
            "ORDER_CREATED", "ORDER_ACCEPTED", "ORDER_PREPARING", "ORDER_READY", "ORDER_CANCELLED",
            "DELIVERY_ON_THE_WAY", "DELIVERY_COMPLETED", "DELIVERY_FAILED", "DELIVERY_CANCELLED");

    private final AppNotificationRepository repository;

    public void orderCreated(Order order) {
        write(order, "ORDER_CREATED", "Order placed", " was placed.");
    }

    public void orderStatusChanged(Order order) {
        switch (order.getStatus()) {
            case "ACCEPTED" -> write(order, "ORDER_ACCEPTED", "Order accepted", " was accepted by the restaurant.");
            case "PREPARING" -> write(order, "ORDER_PREPARING", "Preparing your order", " is being prepared.");
            case "READY" -> write(order, "ORDER_READY", "Order ready for delivery", " is ready for delivery.");
            case "CANCELLED" -> write(order, "ORDER_CANCELLED", "Order cancelled", " was cancelled.");
            default -> { }
        }
    }

    private void write(Order order, String type, String title, String bodySuffix) {
        if (order.getCustomerId() == null || !"DELIVERY".equals(order.getOrderType())) {
            return;
        }
        AppNotification notification = new AppNotification();
        notification.setUserId(order.getCustomerId());
        notification.setOrderId(order.getId());
        notification.setNotificationType(type);
        notification.setTitle(title);
        notification.setBody("Order " + order.getOrderNumber() + bodySuffix);
        notification.setChannel("IN_APP");
        repository.save(notification);
    }
}
