package com.restaurant.platform.security;

import java.util.EnumSet;
import java.util.Set;

public enum RestaurantRole {

    OWNER(EnumSet.allOf(RestaurantPermission.class)),

    MANAGER(EnumSet.allOf(RestaurantPermission.class)),

    STAFF(EnumSet.of(
            RestaurantPermission.RESTAURANT_READ,
            RestaurantPermission.MENU_READ,
            RestaurantPermission.ORDER_READ,
            RestaurantPermission.ORDER_CREATE,
            RestaurantPermission.ORDER_STATUS_UPDATE,
            RestaurantPermission.QUEUE_MANAGE,
            RestaurantPermission.DELIVERY_READ,
            RestaurantPermission.DELIVERY_ASSIGN,
            RestaurantPermission.DELIVERY_STATUS_UPDATE
    )),

    DELIVERY_DRIVER(EnumSet.of(
            // Drivers may view basic restaurant context and work with assigned deliveries.
            // Delivery records must still be scoped to the authenticated driver in the service layer.
            RestaurantPermission.RESTAURANT_READ,
            RestaurantPermission.DELIVERY_READ,
            RestaurantPermission.DELIVERY_STATUS_UPDATE
    ));

    private final Set<RestaurantPermission> permissions;

    RestaurantRole(Set<RestaurantPermission> permissions) {
        this.permissions = Set.copyOf(permissions);
    }

    public boolean allows(RestaurantPermission permission) {
        return permissions.contains(permission);
    }
}