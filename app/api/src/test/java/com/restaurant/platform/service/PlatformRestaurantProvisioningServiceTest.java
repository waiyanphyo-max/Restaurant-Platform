package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.platform.PlatformRestaurantProvisionRequest;
import com.restaurant.platform.dto.platform.PlatformRestaurantConfiguration;
import com.restaurant.platform.dto.restaurant.CreateRestaurantRequest;
import com.restaurant.platform.dto.restaurant.RestaurantOnboardingResponse;
import com.restaurant.platform.dto.restaurant.RestaurantResponse;
import com.restaurant.platform.entity.Profile;
import com.restaurant.platform.repository.ProfileRepository;
import com.restaurant.platform.security.PlatformAdminAuthorization;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class PlatformRestaurantProvisioningServiceTest {
    private final PlatformAdminAuthorization authorization = mock(PlatformAdminAuthorization.class);
    private final SupabaseAuthAdminClient auth = mock(SupabaseAuthAdminClient.class);
    private final ProfileRepository profiles = mock(ProfileRepository.class);
    private final RestaurantManagementService restaurants = mock(RestaurantManagementService.class);
    private final PlatformRestaurantLifecycleService lifecycle = mock(PlatformRestaurantLifecycleService.class);
    private PlatformRestaurantProvisioningService service;
    private final UUID ownerId = UUID.randomUUID();
    private final UUID restaurantId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        service = new PlatformRestaurantProvisioningService(authorization, auth, profiles,
                restaurants, lifecycle, "https://restaurants.example");
        when(authorization.requirePlatformAdmin()).thenReturn(UUID.randomUUID());
        when(restaurants.createRestaurantForPlatformAdmin(eq(ownerId), any())).thenReturn(onboarding());
    }

    @Test
    void verifiedExistingIdentityUsesExactAuthUuidAndNeverProfileContactMatching() {
        when(auth.getUserById(ownerId)).thenReturn(verifiedUser());
        Profile owner = new Profile();
        owner.setId(ownerId);
        owner.setEmail("stale-profile-address@example.com");
        when(profiles.findById(ownerId)).thenReturn(Optional.of(owner));

        var result = service.provision(existingRequest());

        assertEquals(ownerId, result.ownerUserId());
        assertFalse(result.invitationSent());
        assertEquals("ACCEPTED", result.ownerInvitationStatus());
        assertEquals("OWNER", result.ownerRole());
        assertEquals("https://restaurants.example/workspace?restaurantId=" + restaurantId, result.qrSetupUrl());
        assertEquals(result.ownerWorkspaceUrl(), result.qrSetupUrl());
        assertNull(result.commonQrToken());
        assertNull(result.commonQrUrl());
        verify(auth, never()).inviteByEmail(any(), any());
        verify(profiles, never()).findFirstByEmailIgnoreCase(any());
        verify(restaurants).createRestaurantForPlatformAdmin(ownerId, request().restaurant());
        assertEquals("Owner Name", owner.getFullName());
    }

    @Test
    void invitationUsesProviderUuidEvenWhenProfileHasNotBeenBackfilled() {
        when(auth.inviteByEmail("owner@example.com", "Owner Name"))
                .thenReturn(new SupabaseAuthAdminClient.AuthUser(ownerId, "owner@example.com"));

        var result = service.provision(request());

        assertTrue(result.invitationSent());
        assertEquals("INVITED", result.ownerInvitationStatus());
        assertEquals(ownerId, result.ownerUserId());
        verify(restaurants).createRestaurantForPlatformAdmin(ownerId, request().restaurant());
        verify(profiles, never()).findFirstByEmailIgnoreCase(any());
        assertNull(result.commonQrToken());
        assertNull(result.commonQrUrl());
    }

    @Test
    void duplicateSlugIsRejectedBeforeExternalInvitation() {
        doThrow(new ApiException(HttpStatus.CONFLICT, "RESTAURANT_SLUG_EXISTS", "slug"))
                .when(restaurants).validatePlatformProvisioningRequest(any());
        assertEquals("RESTAURANT_SLUG_EXISTS", assertThrows(ApiException.class,
                () -> service.provision(request())).getCode());
        verifyNoInteractions(auth, profiles, lifecycle);
        verify(restaurants, never()).createRestaurantForPlatformAdmin(any(), any());
    }

    @Test
    void missingProviderConfigurationFailsWithoutCreatingRestaurant() {
        when(auth.inviteByEmail(any(), any())).thenThrow(new SupabaseAuthAdminException("missing", true, false, null));
        var failure = assertThrows(ApiException.class, () -> service.provision(request()));
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, failure.getStatus());
        assertEquals("PLATFORM_OWNER_INVITATION_NOT_CONFIGURED", failure.getCode());
        verify(restaurants, never()).createRestaurantForPlatformAdmin(any(), any());
    }

    @Test
    void providerFailureCannotCreateOwnerOrRestaurant() {
        when(auth.inviteByEmail(any(), any())).thenThrow(new SupabaseAuthAdminException("provider detail", false, false, null));
        var failure = assertThrows(ApiException.class, () -> service.provision(request()));
        assertEquals(HttpStatus.BAD_GATEWAY, failure.getStatus());
        assertEquals("PLATFORM_OWNER_INVITATION_PROVIDER_ERROR", failure.getCode());
        verifyNoInteractions(profiles);
        verify(restaurants, never()).createRestaurantForPlatformAdmin(any(), any());
    }

    @Test
    void alreadyRegisteredEmailDoesNotFallBackToSpoofableProfile() {
        when(auth.inviteByEmail(any(), any())).thenThrow(new SupabaseAuthAdminException("duplicate", false, true, null));
        var failure = assertThrows(ApiException.class, () -> service.provision(request()));
        assertEquals("PLATFORM_OWNER_EMAIL_ALREADY_REGISTERED", failure.getCode());
        assertEquals(HttpStatus.CONFLICT, failure.getStatus());
        verifyNoInteractions(profiles);
        verify(restaurants, never()).createRestaurantForPlatformAdmin(any(), any());
    }

    @Test
    void existingUnverifiedEmailCannotAcquireOwnership() {
        when(auth.getUserById(ownerId)).thenReturn(new SupabaseAuthAdminClient.AuthUser(ownerId, "owner@example.com"));
        var failure = assertThrows(ApiException.class, () -> service.provision(existingRequest()));
        assertEquals("PLATFORM_OWNER_EMAIL_NOT_VERIFIED", failure.getCode());
        verifyNoInteractions(profiles);
        verify(restaurants, never()).createRestaurantForPlatformAdmin(any(), any());
    }

    @Test
    void providerIdentityMismatchCannotAcquireOwnership() {
        when(auth.getUserById(ownerId)).thenReturn(new SupabaseAuthAdminClient.AuthUser(UUID.randomUUID(), "owner@example.com"));
        assertEquals("PLATFORM_OWNER_IDENTITY_MISMATCH", assertThrows(ApiException.class,
                () -> service.provision(existingRequest())).getCode());
        verifyNoInteractions(profiles);
        verify(restaurants, never()).createRestaurantForPlatformAdmin(any(), any());
    }

    @Test
    void verifiedAuthEmailMustMatchRequestedContact() {
        when(auth.getUserById(ownerId)).thenReturn(new SupabaseAuthAdminClient.AuthUser(ownerId, "other@example.com",
                OffsetDateTime.now(), null, null, null, null));
        assertEquals("PLATFORM_OWNER_IDENTITY_MISMATCH", assertThrows(ApiException.class,
                () -> service.provision(existingRequest())).getCode());
        verify(restaurants, never()).createRestaurantForPlatformAdmin(any(), any());
    }

    @Test
    void nonAdminCannotCallAuthProviderOrReadProfiles() {
        when(authorization.requirePlatformAdmin()).thenThrow(new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "forbidden"));
        assertEquals(HttpStatus.FORBIDDEN, assertThrows(ApiException.class,
                () -> service.provision(request())).getStatus());
        verifyNoInteractions(auth, profiles, restaurants, lifecycle);
    }

    @Test
    void invalidPublicOriginIsRejectedBeforeInvitation() {
        for (String origin : new String[]{"http://public.example", "javascript:alert(1)", "https://user:password@public.example", "https://public.example/?secret=x"}) {
            var unsafeService = new PlatformRestaurantProvisioningService(authorization, auth, profiles, restaurants, lifecycle, origin);
            assertEquals("PLATFORM_PUBLIC_ORIGIN_NOT_CONFIGURED", assertThrows(ApiException.class,
                    () -> unsafeService.provision(request())).getCode());
        }
        verifyNoInteractions(auth, profiles);
    }

    @Test
    void failedRestaurantWriteIsReportedWithoutRetryingInvitation() {
        when(auth.inviteByEmail(any(), any())).thenReturn(new SupabaseAuthAdminClient.AuthUser(ownerId, "owner@example.com"));
        when(restaurants.createRestaurantForPlatformAdmin(any(), any()))
                .thenThrow(new ApiException(HttpStatus.CONFLICT, "RESTAURANT_SLUG_EXISTS", "slug"));
        assertEquals("RESTAURANT_SLUG_EXISTS", assertThrows(ApiException.class,
                () -> service.provision(request())).getCode());
        verify(auth, times(1)).inviteByEmail(any(), any());
        verifyNoInteractions(lifecycle);
    }

    @Test
    void initialConfigurationIsValidatedBeforeInviteAndSavedForCreatedRestaurant() {
        var configuration = PlatformRestaurantConfiguration.empty();
        var input = new PlatformRestaurantProvisionRequest("owner@example.com", "Owner Name",
                request().restaurant(), null, configuration);
        when(auth.inviteByEmail(any(), any())).thenReturn(new SupabaseAuthAdminClient.AuthUser(ownerId, "owner@example.com"));

        service.provision(input);

        var sequence = inOrder(restaurants, lifecycle, auth);
        sequence.verify(restaurants).validatePlatformProvisioningRequest(input.restaurant());
        sequence.verify(lifecycle).validateConfiguration(configuration);
        sequence.verify(auth).inviteByEmail("owner@example.com", "Owner Name");
        sequence.verify(restaurants).createRestaurantForPlatformAdmin(ownerId, input.restaurant());
        sequence.verify(lifecycle).initializeConfiguration(restaurantId, configuration);
    }

    @Test
    void invalidInitialConfigurationCannotSendInvitation() {
        var configuration = new PlatformRestaurantConfiguration("bad-color", null, null, null);
        var input = new PlatformRestaurantProvisionRequest("owner@example.com", "Owner Name",
                request().restaurant(), null, configuration);
        when(lifecycle.validateConfiguration(configuration)).thenThrow(new ApiException(HttpStatus.BAD_REQUEST,
                "INVALID_PLATFORM_CONFIGURATION", "error.platform-admin.invalid-configuration"));

        assertEquals("INVALID_PLATFORM_CONFIGURATION", assertThrows(ApiException.class,
                () -> service.provision(input)).getCode());
        verifyNoInteractions(auth, profiles);
        verify(restaurants, never()).createRestaurantForPlatformAdmin(any(), any());
    }

    private SupabaseAuthAdminClient.AuthUser verifiedUser() {
        return new SupabaseAuthAdminClient.AuthUser(ownerId, "owner@example.com", OffsetDateTime.now(), null, null, null, null);
    }

    private PlatformRestaurantProvisionRequest existingRequest() {
        return new PlatformRestaurantProvisionRequest("owner@example.com", "Owner Name", request().restaurant(), ownerId, null);
    }

    private PlatformRestaurantProvisionRequest request() {
        var restaurant = new CreateRestaurantRequest("Example Kitchen", "example-kitchen", "Food", "09123456789",
                null, null, null, null, "Min Buri", "Bangkok", null, null, null, "MMK", "Asia/Yangon");
        return new PlatformRestaurantProvisionRequest("owner@example.com", "Owner Name", restaurant);
    }

    private RestaurantOnboardingResponse onboarding() {
        OffsetDateTime now = OffsetDateTime.now();
        var restaurant = new RestaurantResponse(restaurantId, "Example Kitchen", "example-kitchen", "Food", "09123456789",
                null, null, null, null, "Min Buri", "Bangkok", null, null, null, true, now, now);
        return new RestaurantOnboardingResponse(restaurant, "OWNER", "MMK", "Asia/Yangon", "a".repeat(64));
    }
}
