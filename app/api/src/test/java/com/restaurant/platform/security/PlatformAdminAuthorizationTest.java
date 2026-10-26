package com.restaurant.platform.security;

import com.restaurant.platform.common.error.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class PlatformAdminAuthorizationTest {
    private final RestaurantAuthorization identity = mock(RestaurantAuthorization.class);
    private final UUID adminId = UUID.randomUUID();
    private final UUID otherId = UUID.randomUUID();

    @Test
    void configuredPlatformAdminIsAllowed() {
        when(identity.requireAuthenticatedUserId()).thenReturn(adminId);
        PlatformAdminAuthorization authorization =
                new PlatformAdminAuthorization(identity, adminId.toString());

        assertEquals(adminId, authorization.requirePlatformAdmin());
    }

    @Test
    void ordinaryAuthenticatedUserIsForbidden() {
        when(identity.requireAuthenticatedUserId()).thenReturn(otherId);
        PlatformAdminAuthorization authorization =
                new PlatformAdminAuthorization(identity, adminId.toString());

        ApiException error = assertThrows(ApiException.class, authorization::requirePlatformAdmin);

        assertEquals(HttpStatus.FORBIDDEN, error.getStatus());
        assertEquals("PLATFORM_ADMIN_REQUIRED", error.getCode());
    }

    @Test
    void missingOrInvalidAllowlistFailsClosed() {
        when(identity.requireAuthenticatedUserId()).thenReturn(adminId);
        PlatformAdminAuthorization missing =
                new PlatformAdminAuthorization(identity, "");
        PlatformAdminAuthorization invalid =
                new PlatformAdminAuthorization(identity, "not-a-uuid");

        ApiException missingError = assertThrows(ApiException.class, missing::requirePlatformAdmin);
        ApiException invalidError = assertThrows(ApiException.class, invalid::requirePlatformAdmin);

        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, missingError.getStatus());
        assertEquals("PLATFORM_ADMIN_NOT_CONFIGURED", missingError.getCode());
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, invalidError.getStatus());
    }
}
