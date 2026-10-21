package com.restaurant.platform.security;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class RestaurantRoleTest {

    @Test
    void deliveryDriverCanManageAssignedDeliveryWorkflowWithoutGeneralOrderAccess() {
        assertTrue(RestaurantRole.DELIVERY_DRIVER.allows(RestaurantPermission.DELIVERY_READ));
        assertTrue(RestaurantRole.DELIVERY_DRIVER.allows(RestaurantPermission.DELIVERY_STATUS_UPDATE));
        assertTrue(RestaurantRole.DELIVERY_DRIVER.allows(RestaurantPermission.RESTAURANT_READ));

        assertFalse(RestaurantRole.DELIVERY_DRIVER.allows(RestaurantPermission.ORDER_READ));
        assertFalse(RestaurantRole.DELIVERY_DRIVER.allows(RestaurantPermission.ORDER_CREATE));
        assertFalse(RestaurantRole.DELIVERY_DRIVER.allows(RestaurantPermission.ORDER_STATUS_UPDATE));
        assertFalse(RestaurantRole.DELIVERY_DRIVER.allows(RestaurantPermission.ORDER_CANCEL));
        assertFalse(RestaurantRole.DELIVERY_DRIVER.allows(RestaurantPermission.DELIVERY_ASSIGN));
        assertFalse(RestaurantRole.DELIVERY_DRIVER.allows(RestaurantPermission.MENU_MANAGE));
        assertFalse(RestaurantRole.DELIVERY_DRIVER.allows(RestaurantPermission.MEMBERS_MANAGE));
    }
}
