package com.restaurant.platform.security;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class RestaurantRoleTest {

    @Test
    void ownerHasEveryRestaurantPermission() {
        for (RestaurantPermission permission : RestaurantPermission.values()) {
            assertTrue(RestaurantRole.OWNER.allows(permission), permission.name());
        }
    }

    @Test
    void managerCanManageOperationsButNotRestaurantMembership() {
        assertTrue(RestaurantRole.MANAGER.allows(RestaurantPermission.SETTINGS_MANAGE));
        assertTrue(RestaurantRole.MANAGER.allows(RestaurantPermission.MENU_MANAGE));
        assertTrue(RestaurantRole.MANAGER.allows(RestaurantPermission.ORDER_READ));
        assertTrue(RestaurantRole.MANAGER.allows(RestaurantPermission.DELIVERY_ASSIGN));
        assertTrue(RestaurantRole.MANAGER.allows(RestaurantPermission.REPORT_READ));
        assertTrue(RestaurantRole.MANAGER.allows(RestaurantPermission.PAYMENT_COLLECT));
        assertFalse(RestaurantRole.MANAGER.allows(RestaurantPermission.MEMBERS_MANAGE));
    }

    @Test
    void staffCanPerformOperationalTasksButCannotAssignDriversOrManageMembership() {
        assertTrue(RestaurantRole.STAFF.allows(RestaurantPermission.ORDER_READ));
        assertTrue(RestaurantRole.STAFF.allows(RestaurantPermission.ORDER_CREATE));
        assertTrue(RestaurantRole.STAFF.allows(RestaurantPermission.QUEUE_MANAGE));
        assertTrue(RestaurantRole.STAFF.allows(RestaurantPermission.DELIVERY_STATUS_UPDATE));
        assertTrue(RestaurantRole.STAFF.allows(RestaurantPermission.PAYMENT_READ));
        assertTrue(RestaurantRole.STAFF.allows(RestaurantPermission.PAYMENT_COLLECT));
        assertFalse(RestaurantRole.STAFF.allows(RestaurantPermission.DELIVERY_ASSIGN));
        assertFalse(RestaurantRole.STAFF.allows(RestaurantPermission.MEMBERS_MANAGE));
        assertFalse(RestaurantRole.STAFF.allows(RestaurantPermission.SETTINGS_MANAGE));
    }

    @Test
    void deliveryDriverHasOnlyDeliveryOperationsAndBasicRestaurantRead() {
        assertTrue(RestaurantRole.DELIVERY_DRIVER.allows(RestaurantPermission.DELIVERY_READ));
        assertTrue(RestaurantRole.DELIVERY_DRIVER.allows(RestaurantPermission.DELIVERY_STATUS_UPDATE));
        assertTrue(RestaurantRole.DELIVERY_DRIVER.allows(RestaurantPermission.RESTAURANT_READ));

        assertFalse(RestaurantRole.DELIVERY_DRIVER.allows(RestaurantPermission.ORDER_READ));
        assertFalse(RestaurantRole.DELIVERY_DRIVER.allows(RestaurantPermission.PAYMENT_READ));
        assertFalse(RestaurantRole.DELIVERY_DRIVER.allows(RestaurantPermission.PAYMENT_COLLECT));
        assertFalse(RestaurantRole.DELIVERY_DRIVER.allows(RestaurantPermission.ORDER_CREATE));
        assertFalse(RestaurantRole.DELIVERY_DRIVER.allows(RestaurantPermission.ORDER_STATUS_UPDATE));
        assertFalse(RestaurantRole.DELIVERY_DRIVER.allows(RestaurantPermission.ORDER_CANCEL));
        assertFalse(RestaurantRole.DELIVERY_DRIVER.allows(RestaurantPermission.DELIVERY_ASSIGN));
        assertFalse(RestaurantRole.DELIVERY_DRIVER.allows(RestaurantPermission.MENU_MANAGE));
        assertFalse(RestaurantRole.DELIVERY_DRIVER.allows(RestaurantPermission.MEMBERS_MANAGE));
    }
}
