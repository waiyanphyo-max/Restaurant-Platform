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
    }
}
