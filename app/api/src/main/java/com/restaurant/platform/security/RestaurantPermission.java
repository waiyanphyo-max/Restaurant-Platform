package com.restaurant.platform.security;

public enum RestaurantPermission {
    RESTAURANT_READ,
    SETTINGS_MANAGE,
    MEMBERS_MANAGE,

    MENU_READ,
    MENU_MANAGE,

    ORDER_READ,
    ORDER_CREATE,
    ORDER_STATUS_UPDATE,
    ORDER_CANCEL,

    QUEUE_MANAGE,

    DELIVERY_READ,
    DELIVERY_ASSIGN,
    DELIVERY_STATUS_UPDATE,

    REPORT_READ
}