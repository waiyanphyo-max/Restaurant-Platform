package com.restaurant.platform.service;

import com.restaurant.platform.dto.platform.PlatformRestaurantProvisionRequest;
import com.restaurant.platform.dto.restaurant.CreateRestaurantRequest;
import com.restaurant.platform.dto.restaurant.RestaurantOnboardingResponse;
import com.restaurant.platform.dto.restaurant.RestaurantResponse;
import com.restaurant.platform.entity.Profile;
import com.restaurant.platform.repository.ProfileRepository;
import com.restaurant.platform.security.PlatformAdminAuthorization;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class PlatformRestaurantProvisioningServiceTest {
    private PlatformAdminAuthorization platformAdminAuthorization;
    private SupabaseAuthAdminClient authAdminClient;
    private ProfileRepository profileRepository;
    private RestaurantManagementService restaurantManagementService;
    private PlatformRestaurantProvisioningService service;

    private final UUID operatorId = UUID.randomUUID();
    private final UUID ownerId = UUID.randomUUID();
    private final UUID restaurantId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        platformAdminAuthorization = mock(PlatformAdminAuthorization.class);
        authAdminClient = mock(SupabaseAuthAdminClient.class);
        profileRepository = mock(ProfileRepository.class);
        restaurantManagementService = mock(RestaurantManagementService.class);
        service = new PlatformRestaurantProvisioningService(
                platformAdminAuthorization, authAdminClient, profileRepository,
                restaurantManagementService, "https://restaurants.example");
        when(platformAdminAuthorization.requirePlatformAdmin()).thenReturn(operatorId);
    }

    @Test
    void provisionsRestaurantForExistingOwnerAccountWithoutSendingInvite() {
        Profile owner = profile(ownerId, "owner@example.com", null);
        when(profileRepository.findFirstByEmailIgnoreCase("owner@example.com"))
                .thenReturn(Optional.of(owner));
        when(restaurantManagementService.createRestaurantForPlatformAdmin(
                eq(ownerId), any(CreateRestaurantRequest.class)))
                .thenReturn(onboarding());

        var response = service.provision(request());

        assertEquals(ownerId, response.ownerUserId());
        assertEquals("owner@example.com", response.ownerEmail());
        assertFalse(response.invitationSent());
        assertEquals("OWNER", response.ownerRole());
        assertTrue(response.ownerWorkspaceUrl().startsWith(
                "https://restaurants.example/workspace?restaurantId=" + restaurantId));
        assertTrue(response.commonQrUrl().contains("view=customer-pickup"));
        assertTrue(response.commonQrUrl().contains("restaurantId=" + restaurantId));
        assertTrue(response.commonQrUrl().contains("#qrToken=" + "a".repeat(64)));
        assertEquals("a".repeat(64), response.commonQrToken());

        verify(authAdminClient, never()).inviteByEmail(any(), any());
        verify(restaurantManagementService).validatePlatformProvisioningRequest(any());
        verify(restaurantManagementService).createRestaurantForPlatformAdmin(
                ownerId, request().restaurant());
        assertEquals("Owner Name", owner.getFullName());
        verify(profileRepository).save(owner);
    }

    @Test
    void invitesNewOwnerAndUsesTheAuthUserCreatedBySupabase() {
        when(profileRepository.findFirstByEmailIgnoreCase("owner@example.com"))
                .thenReturn(Optional.empty());
        when(authAdminClient.inviteByEmail("owner@example.com", "Owner Name"))
                .thenReturn(new SupabaseAuthAdminClient.AuthUser(ownerId, "owner@example.com"));
        Profile owner = profile(ownerId, "owner@example.com", "Owner Name");
        when(profileRepository.findById(ownerId)).thenReturn(Optional.of(owner));
        when(restaurantManagementService.createRestaurantForPlatformAdmin(
                eq(ownerId), any(CreateRestaurantRequest.class)))
                .thenReturn(onboarding());

        var response = service.provision(request());

        assertTrue(response.invitationSent());
        assertEquals(ownerId, response.ownerUserId());
        verify(authAdminClient).inviteByEmail("owner@example.com", "Owner Name");
        verify(restaurantManagementService).createRestaurantForPlatformAdmin(
                eq(ownerId), any(CreateRestaurantRequest.class));
    }

    private PlatformRestaurantProvisionRequest request() {
        CreateRestaurantRequest restaurant = new CreateRestaurantRequest(
                "Example Kitchen", "example-kitchen", "Food",
                "09123456789", null, null, null, null,
                "Min Buri", "Bangkok", null, null, null,
                "MMK", "Asia/Yangon");
        return new PlatformRestaurantProvisionRequest(
                "owner@example.com", "Owner Name", restaurant);
    }

    private RestaurantOnboardingResponse onboarding() {
        OffsetDateTime now = OffsetDateTime.now();
        RestaurantResponse restaurant = new RestaurantResponse(
                restaurantId, "Example Kitchen", "example-kitchen", "Food",
                "09123456789", null, null, null, null,
                "Min Buri", "Bangkok", null, null, null, true, now, now);
        return new RestaurantOnboardingResponse(
                restaurant, "OWNER", "MMK", "Asia/Yangon", "a".repeat(64));
    }

    private Profile profile(UUID id, String email, String fullName) {
        Profile profile = new Profile();
        profile.setId(id);
        profile.setEmail(email);
        profile.setFullName(fullName);
        profile.setPreferredLanguage("en");
        return profile;
    }
}
