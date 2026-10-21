package com.restaurant.platform.security;

import java.util.EnumSet;
import java.util.Set;

public enum RestaurantRole {

    OWNER(EnumSet.allOf(RestaurantPermission.class)),

    // Explicit grants avoid accidentally granting newly added permissions to managers.
    MANAGER(EnumSet.of(
            RestaurantPermission.RESTAURANT_READ,
            RestaurantPermission.SETTINGS_MANAGE,
            RestaurantPermission.MENU_READ,
            RestaurantPermission.MENU_MANAGE,
            RestaurantPermission.ORDER_READ,
            RestaurantPermission.ORDER_CREATE,
            RestaurantPermission.ORDER_STATUS_UPDATE,
            RestaurantPermission.ORDER_CANCEL,
            RestaurantPermission.QUEUE_MANAGE,
            RestaurantPermission.DELIVERY_READ,
            RestaurantPermission.DELIVERY_ASSIGN,
            RestaurantPermission.DELIVERY_STATUS_UPDATE,
            RestaurantPermission.REPORT_READ
    )),

    STAFF(EnumSet.of(
            RestaurantPermission.RESTAURANT_READ,
            RestaurantPermission.MENU_READ,
            RestaurantPermission.ORDER_READ,
            RestaurantPermission.ORDER_CREATE,
            RestaurantPermission.ORDER_STATUS_UPDATE,
            RestaurantPermission.QUEUE_MANAGE,
            RestaurantPermission.DELIVERY_READ,
            RestaurantPermission.DELIVERY_STATUS_UPDATE
    )),

    DELIVERY_DRIVER(EnumSet.of(
            // Driver data access is additionally restricted to deliveries assigned to them.
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
