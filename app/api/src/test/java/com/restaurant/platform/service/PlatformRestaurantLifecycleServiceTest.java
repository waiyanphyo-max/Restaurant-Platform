package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.platform.PlatformRestaurantConfiguration;
import com.restaurant.platform.dto.platform.PlatformRestaurantConfigurationRequest;
import com.restaurant.platform.dto.platform.PlatformRestaurantStatusRequest;
import com.restaurant.platform.entity.Profile;
import com.restaurant.platform.entity.Restaurant;
import com.restaurant.platform.entity.RestaurantMember;
import com.restaurant.platform.entity.RestaurantPlatformConfiguration;
import com.restaurant.platform.entity.RestaurantSettings;
import com.restaurant.platform.repository.*;
import com.restaurant.platform.security.PlatformAdminAuthorization;
import com.restaurant.platform.security.RestaurantRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class PlatformRestaurantLifecycleServiceTest {
    private final UUID restaurantId = UUID.randomUUID();
    private final UUID ownerId = UUID.randomUUID();
    private PlatformAdminAuthorization authorization;
    private RestaurantRepository restaurants;
    private RestaurantSettingsRepository settings;
    private RestaurantMemberRepository members;
    private OrderRepository orders;
    private ProfileRepository profiles;
    private RestaurantPlatformConfigurationRepository configurations;
    private SupabaseAuthAdminClient authAdmin;
    private PlatformRestaurantLifecycleService service;
    private Restaurant restaurant;

    @BeforeEach
    void setUp() {
        authorization = mock(PlatformAdminAuthorization.class);
        restaurants = mock(RestaurantRepository.class);
        settings = mock(RestaurantSettingsRepository.class);
        members = mock(RestaurantMemberRepository.class);
        orders = mock(OrderRepository.class);
        profiles = mock(ProfileRepository.class);
        configurations = mock(RestaurantPlatformConfigurationRepository.class);
        authAdmin = mock(SupabaseAuthAdminClient.class);
        service = new PlatformRestaurantLifecycleService(authorization, restaurants, settings,
                members, orders, profiles, configurations, authAdmin, "https://guest.example.test");
        restaurant = new Restaurant();
        restaurant.setId(restaurantId);
        restaurant.setName("Garden");
        restaurant.setSlug("garden");
        restaurant.setTownship("Bahan");
        restaurant.setCity("Yangon");
        when(restaurants.findById(restaurantId)).thenReturn(Optional.of(restaurant));
        when(restaurants.saveAndFlush(any())).thenAnswer(invocation -> invocation.getArgument(0));
        RestaurantSettings row = new RestaurantSettings();
        row.setRestaurantId(restaurantId);
        row.setCommonQrToken("never-expose-this-secret");
        when(settings.findById(restaurantId)).thenReturn(Optional.of(row));
        when(members.findByRestaurantIdAndRoleOrderByCreatedAtAsc(restaurantId, RestaurantRole.OWNER))
                .thenReturn(List.of());
    }

    @Test
    void deniedIdentityNeverReadsOrWritesAnyTenantData() {
        when(authorization.requirePlatformAdmin()).thenThrow(new ApiException(
                HttpStatus.FORBIDDEN, "PLATFORM_ADMIN_REQUIRED", "error.platform-admin.required"));
        assertThrows(ApiException.class, () -> service.getDetail(restaurantId));
        assertThrows(ApiException.class, () -> service.updateStatus(restaurantId,
                new PlatformRestaurantStatusRequest(false)));
        assertThrows(ApiException.class, () -> service.updateConfiguration(restaurantId,
                new PlatformRestaurantConfigurationRequest("Garden", "garden", null, null)));
        assertThrows(ApiException.class, () -> service.initializeConfiguration(restaurantId,
                PlatformRestaurantConfiguration.empty()));
        verifyNoInteractions(restaurants, settings, members, orders, profiles, configurations, authAdmin);
    }

    @Test
    void detailScopesEveryDataReadToRequestedRestaurantAndReturnsNoQrCredential() {
        when(members.countByRestaurantId(restaurantId)).thenReturn(4L);
        when(orders.countByRestaurantId(restaurantId)).thenReturn(11L);
        var response = service.getDetail(restaurantId);
        assertEquals(restaurantId, response.restaurant().id());
        assertEquals(4, response.memberCount());
        assertEquals(11, response.orderCount());
        assertEquals("MMK", response.currency());
        assertEquals(PlatformRestaurantConfiguration.empty(), response.configuration());
        assertEquals("https://guest.example.test/workspace?restaurantId=" + restaurantId,
                response.ownerWorkspaceUrl());
        assertEquals(response.ownerWorkspaceUrl() + "&setup=qr", response.qrSetupUrl());
        assertFalse(response.toString().contains("never-expose-this-secret"));
        verify(restaurants).findById(restaurantId);
        verify(settings).findById(restaurantId);
        verify(configurations).findById(restaurantId);
        verify(members).countByRestaurantId(restaurantId);
        verify(members).findByRestaurantIdAndRoleOrderByCreatedAtAsc(restaurantId, RestaurantRole.OWNER);
        verify(orders).countByRestaurantId(restaurantId);
        verifyNoMoreInteractions(restaurants, settings, configurations, members, orders);
        verifyNoInteractions(profiles, authAdmin);
    }

    @Test
    void missingRestaurantCannotExposeOtherRestaurantSettings() {
        UUID otherId = UUID.randomUUID();
        var error = assertThrows(ApiException.class, () -> service.getDetail(otherId));
        assertEquals(HttpStatus.NOT_FOUND, error.getStatus());
        verifyNoInteractions(settings, configurations, members, orders, profiles, authAdmin);
    }

    @Test
    void ownerAcceptanceUsesExactMembershipAuthUuidInsteadOfProfileEmail() {
        addOwner();
        Profile spoofedEmailProfile = new Profile();
        spoofedEmailProfile.setId(ownerId);
        spoofedEmailProfile.setEmail("different-profile-email@example.test");
        spoofedEmailProfile.setFullName("Owner");
        when(profiles.findById(ownerId)).thenReturn(Optional.of(spoofedEmailProfile));
        when(authAdmin.getUserById(ownerId)).thenReturn(new SupabaseAuthAdminClient.AuthUser(
                ownerId, "verified@example.test", OffsetDateTime.now(), OffsetDateTime.now(),
                OffsetDateTime.now(), null, null));
        var owner = service.getDetail(restaurantId).owners().getFirst();
        assertEquals(ownerId, owner.userId());
        assertEquals("verified@example.test", owner.email());
        assertEquals("ACCEPTED", owner.invitationStatus());
        verify(authAdmin).getUserById(ownerId);
        verify(profiles, never()).findFirstByEmailIgnoreCase(any());
    }

    @Test
    void invitationStatusRemainsInvitedUntilAuthConfirmsIdentity() {
        addOwner();
        when(authAdmin.getUserById(ownerId)).thenReturn(new SupabaseAuthAdminClient.AuthUser(
                ownerId, "invited@example.test", null, OffsetDateTime.now(), null, null, null));
        assertEquals("INVITED", service.getDetail(restaurantId).owners().getFirst().invitationStatus());
    }

    @Test
    void providerOutageDoesNotInventOwnerAcceptance() {
        addOwner();
        when(authAdmin.getUserById(ownerId)).thenThrow(new SupabaseAuthAdminException(
                "Unavailable", false, false, null));
        var response = service.getDetail(restaurantId);
        assertEquals("PROVIDER_UNAVAILABLE", response.owners().getFirst().invitationStatus());
        assertEquals(restaurantId, response.restaurant().id());
        assertNull(response.owners().getFirst().email());
    }

    @Test
    void mismatchedAuthProviderIdentityDoesNotPopulateVerifiedOwnerEmail() {
        addOwner();
        when(authAdmin.getUserById(ownerId)).thenReturn(new SupabaseAuthAdminClient.AuthUser(
                UUID.randomUUID(), "different@example.test", OffsetDateTime.now(), null, null, null, null));
        var owner = service.getDetail(restaurantId).owners().getFirst();
        assertEquals("PROVIDER_UNAVAILABLE", owner.invitationStatus());
        assertNull(owner.email());
    }

    @Test
    void configuredWorkspaceLinksRejectUnsafeOriginsAndNormalizeTrailingSlash() {
        for (String origin : List.of("javascript:alert(1)", "http:broken", "http://insecure.example.test",
                "https://user:secret@example.test", "https://example.test?token=private")) {
            var invalidService = new PlatformRestaurantLifecycleService(authorization, restaurants,
                    settings, members, orders, profiles, configurations, authAdmin, origin);
            var error = assertThrows(ApiException.class, () -> invalidService.getDetail(restaurantId));
            assertEquals("PLATFORM_WORKSPACE_URL_NOT_CONFIGURED", error.getCode());
        }
        var validService = new PlatformRestaurantLifecycleService(authorization, restaurants,
                settings, members, orders, profiles, configurations, authAdmin, "https://guest.example.test/");
        assertEquals("https://guest.example.test/workspace?restaurantId=" + restaurantId,
                validService.getDetail(restaurantId).ownerWorkspaceUrl());
    }

    @Test
    void statusManagementCanReactivateAnInactiveRestaurant() {
        restaurant.setIsActive(false);
        assertTrue(service.updateStatus(restaurantId, new PlatformRestaurantStatusRequest(true))
                .restaurant().active());
        assertFalse(service.updateStatus(restaurantId, new PlatformRestaurantStatusRequest(false))
                .restaurant().active());
        verify(restaurants, times(2)).findById(restaurantId);
        verify(restaurants, never()).findByIdAndIsActiveTrue(any());
    }

    @Test
    void duplicateSlugDoesNotWriteBrandingOrMetadata() {
        when(restaurants.existsBySlugAndIdNot("taken", restaurantId)).thenReturn(true);
        var error = assertThrows(ApiException.class, () -> service.updateConfiguration(restaurantId,
                new PlatformRestaurantConfigurationRequest("Garden", "taken", null, null)));
        assertEquals("RESTAURANT_SLUG_EXISTS", error.getCode());
        verify(restaurants, never()).saveAndFlush(any());
        verifyNoInteractions(configurations);
    }

    @Test
    void configurationSavesOnlyRequestedTenantAndNormalizesPublicMetadata() {
        var input = new PlatformRestaurantConfiguration("#abcdef", "#123456",
                new PlatformRestaurantConfiguration.GuestDomains(List.of("Staging.Example.test"),
                        List.of("garden.example.test")),
                new PlatformRestaurantConfiguration.Android(
                        new PlatformRestaurantConfiguration.AndroidApplication("Garden Operations",
                                "test.garden.operations.staging", "test.garden.operations", "assets/garden/operations.png"),
                        new PlatformRestaurantConfiguration.AndroidApplication("Garden Customer",
                                "test.garden.customer.staging", "test.garden.customer", "assets/garden/customer.png")));
        var response = service.updateConfiguration(restaurantId,
                new PlatformRestaurantConfigurationRequest("New Garden", "new-garden",
                        "https://cdn.example.test/garden.png", input));
        assertEquals("New Garden", response.restaurant().name());
        assertEquals("new-garden", response.restaurant().slug());
        var captor = ArgumentCaptor.forClass(RestaurantPlatformConfiguration.class);
        verify(configurations).save(captor.capture());
        assertEquals(restaurantId, captor.getValue().getRestaurantId());
        assertEquals("#ABCDEF", captor.getValue().getConfiguration().primaryColor());
        assertEquals(List.of("staging.example.test"), captor.getValue().getConfiguration().guestDomains().staging());
    }

    @Test
    void unsafeLogoDomainsAppIdsAndAssetPathsAreRejectedBeforeWrites() {
        for (String logo : List.of("javascript:alert(1)", "http://cdn.example.test/logo.png",
                "https://cdn.example.test/logo.png?token=private", "https://user:secret@cdn.example.test/logo.png")) {
            assertThrows(ApiException.class, () -> service.updateConfiguration(restaurantId,
                    new PlatformRestaurantConfigurationRequest("Garden", "garden", logo, null)));
        }
        for (String domain : List.of("https://garden.example.test", "garden.example.test/path", "127.0.0.1", "*.example.test")) {
            assertThrows(ApiException.class, () -> service.validateConfiguration(
                    new PlatformRestaurantConfiguration(null, null,
                            new PlatformRestaurantConfiguration.GuestDomains(List.of(domain), List.of()), null)));
        }
        assertThrows(ApiException.class, () -> service.validateConfiguration(new PlatformRestaurantConfiguration(
                "red", null, null, null)));
        assertThrows(ApiException.class, () -> service.validateConfiguration(new PlatformRestaurantConfiguration(
                null, null, null, new PlatformRestaurantConfiguration.Android(
                new PlatformRestaurantConfiguration.AndroidApplication(null, "bad/id", null, null), null))));
        assertThrows(ApiException.class, () -> service.validateConfiguration(new PlatformRestaurantConfiguration(
                null, null, null, new PlatformRestaurantConfiguration.Android(
                new PlatformRestaurantConfiguration.AndroidApplication(null, null, null, "assets/../secret.png"), null))));
        verify(restaurants, never()).saveAndFlush(any());
        verifyNoInteractions(configurations, authAdmin);
    }

    private void addOwner() {
        var owner = new RestaurantMember();
        owner.setRestaurantId(restaurantId);
        owner.setUserId(ownerId);
        owner.setRole(RestaurantRole.OWNER);
        when(members.findByRestaurantIdAndRoleOrderByCreatedAtAsc(restaurantId, RestaurantRole.OWNER))
                .thenReturn(List.of(owner));
    }
}
