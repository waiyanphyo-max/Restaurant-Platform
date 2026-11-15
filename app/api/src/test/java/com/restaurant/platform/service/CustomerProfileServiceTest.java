package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.customer.CustomerProfileRequest;
import com.restaurant.platform.entity.Profile;
import com.restaurant.platform.repository.ProfileRepository;
import com.restaurant.platform.security.RestaurantAuthorization;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class CustomerProfileServiceTest {

    private ProfileRepository profileRepository;
    private RestaurantAuthorization authorization;
    private CustomerProfileService service;
    private final UUID userId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        profileRepository = mock(ProfileRepository.class);
        authorization = mock(RestaurantAuthorization.class);
        service = new CustomerProfileService(profileRepository, authorization);
    }

    @Test
    void updateCreatesMissingProfileForAuthenticatedUserOnly() {
        when(profileRepository.findById(userId)).thenReturn(Optional.empty());
        when(profileRepository.save(any(Profile.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        var response = service.updateMyProfile(userId,
                new CustomerProfileRequest(" Customer ", " 0912345678 ", "my-MM"));

        assertEquals(userId, response.id());
        assertEquals("Customer", response.fullName());
        assertEquals("0912345678", response.phone());
        assertEquals("my-MM", response.preferredLanguage());
        verify(authorization).requireAuthenticatedUserMatches(userId);
        var captor = org.mockito.ArgumentCaptor.forClass(Profile.class);
        verify(profileRepository).save(captor.capture());
        assertEquals(userId, captor.getValue().getId());
    }

    @Test
    void unsupportedLanguageIsRejectedBeforeSaving() {
        ApiException error = assertThrows(ApiException.class,
                () -> service.updateMyProfile(userId,
                        new CustomerProfileRequest("Customer", "0912345678", "fr")));

        assertEquals("INVALID_CUSTOMER_PROFILE", error.getCode());
        assertEquals(HttpStatus.BAD_REQUEST, error.getStatus());
        verify(profileRepository, never()).save(any(Profile.class));
    }

    @Test
    void getMyProfileReturnsNotFoundWhenProfileHasNotBeenCreated() {
        when(profileRepository.findById(userId)).thenReturn(Optional.empty());

        ApiException error = assertThrows(ApiException.class,
                () -> service.getMyProfile(userId));

        assertEquals("CUSTOMER_PROFILE_NOT_FOUND", error.getCode());
        assertEquals(HttpStatus.NOT_FOUND, error.getStatus());
        verify(profileRepository).restoreMissingFromAuthUser(userId);
        verify(profileRepository, never()).save(any());
    }

    @Test
    void getRepairsMissingProfileFromAuthRegistryBeforeReturningIt() {
        Profile restored = new Profile();
        restored.setId(userId);
        restored.setFullName("Customer");
        restored.setPhone("0912345678");
        when(profileRepository.findById(userId)).thenReturn(Optional.empty(), Optional.of(restored));

        var response = service.getMyProfile(userId);

        assertEquals(userId, response.id());
        assertEquals("Customer", response.fullName());
        var ordered = inOrder(authorization, profileRepository);
        ordered.verify(authorization).requireAuthenticatedUserMatches(userId);
        ordered.verify(profileRepository).findById(userId);
        ordered.verify(profileRepository).restoreMissingFromAuthUser(userId);
        ordered.verify(profileRepository).findById(userId);
    }

    @Test
    void getPreservesExistingProfileWithoutSynchronizingOverCustomerEdits() {
        Profile existing = new Profile();
        existing.setId(userId);
        existing.setFullName("Edited name");
        when(profileRepository.findById(userId)).thenReturn(Optional.of(existing));

        assertEquals("Edited name", service.getMyProfile(userId).fullName());
        verify(profileRepository, never()).restoreMissingFromAuthUser(any());
        verify(profileRepository, never()).save(any());
    }

    @Test
    void mismatchedIdentityCannotReadOrRepairAnotherCustomersProfile() {
        doThrow(new ApiException(HttpStatus.FORBIDDEN, "AUTHENTICATED_USER_MISMATCH",
                "error.authentication.user_mismatch"))
                .when(authorization).requireAuthenticatedUserMatches(userId);

        assertThrows(ApiException.class, () -> service.getMyProfile(userId));
        verifyNoInteractions(profileRepository);
    }

    @Test
    void optionalAvatarStorageFailureDoesNotBlockProfileOrCheckoutAccountLoading() {
        var storage = mock(SupabaseMediaStorageClient.class);
        service = new CustomerProfileService(profileRepository, authorization, storage);
        Profile existing = new Profile();
        existing.setId(userId);
        existing.setFullName("Customer");
        existing.setAvatarPath(userId + "/private-photo.png");
        existing.setAvatarUrl("https://legacy.example.test/old-avatar.png");
        when(profileRepository.findById(userId)).thenReturn(Optional.of(existing));

        for (String code : new String[]{"MEDIA_STORAGE_NOT_CONFIGURED", "MEDIA_STORAGE_OPERATION_FAILED"}) {
            doThrow(new ApiException(HttpStatus.SERVICE_UNAVAILABLE, code, "error.media.storage-operation-failed"))
                    .when(storage).createSignedAvatarUrl(existing.getAvatarPath());
            var response = service.getMyProfile(userId);
            assertEquals(userId, response.id());
            assertEquals("Customer", response.fullName());
            assertNull(response.avatarUrl());
            assertEquals(userId + "/private-photo.png", existing.getAvatarPath());
        }
        verify(profileRepository, never()).save(any());

        doReturn("https://storage.example.test/signed-avatar").when(storage).createSignedAvatarUrl(existing.getAvatarPath());
        assertEquals("https://storage.example.test/signed-avatar", service.getMyProfile(userId).avatarUrl());
    }

    @Test
    void avatarFallbackDoesNotSuppressUnrelatedAuthorizationErrors() {
        var storage = mock(SupabaseMediaStorageClient.class);
        service = new CustomerProfileService(profileRepository, authorization, storage);
        Profile existing = new Profile();
        existing.setId(userId);
        existing.setAvatarPath(userId + "/private-photo.png");
        when(profileRepository.findById(userId)).thenReturn(Optional.of(existing));
        ApiException failure = new ApiException(HttpStatus.FORBIDDEN, "AUTHENTICATED_USER_MISMATCH", "error.authentication.user_mismatch");
        when(storage.createSignedAvatarUrl(existing.getAvatarPath())).thenThrow(failure);

        assertSame(failure, assertThrows(ApiException.class, () -> service.getMyProfile(userId)));
    }
}
