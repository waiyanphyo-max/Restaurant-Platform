package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.restaurant.CreateRestaurantRequest;
import com.restaurant.platform.entity.Profile;
import com.restaurant.platform.entity.Restaurant;
import com.restaurant.platform.entity.RestaurantMember;
import com.restaurant.platform.entity.RestaurantSettings;
import com.restaurant.platform.repository.ProfileRepository;
import com.restaurant.platform.repository.RestaurantMemberRepository;
import com.restaurant.platform.repository.RestaurantRepository;
import com.restaurant.platform.repository.RestaurantSettingsRepository;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.security.RestaurantRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class RestaurantManagementServiceTest {
    private RestaurantRepository restaurantRepository;
    private RestaurantSettingsRepository settingsRepository;
    private RestaurantMemberRepository memberRepository;
    private ProfileRepository profileRepository;
    private RestaurantAuthorization authorization;
    private RestaurantManagementService service;

    private final UUID ownerId = UUID.randomUUID();
    private final UUID restaurantId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        restaurantRepository = mock(RestaurantRepository.class);
        settingsRepository = mock(RestaurantSettingsRepository.class);
        memberRepository = mock(RestaurantMemberRepository.class);
        profileRepository = mock(ProfileRepository.class);
        authorization = mock(RestaurantAuthorization.class);
        service = new RestaurantManagementService(
                restaurantRepository, settingsRepository, memberRepository,
                profileRepository, authorization);
    }

    @Test
    void onboardingCreatesRestaurantSettingsOwnerAndReturnsOneTimeQrToken() {
        when(restaurantRepository.existsBySlug("tea-shop")).thenReturn(false);
        when(profileRepository.findById(ownerId)).thenReturn(Optional.empty());
        when(profileRepository.save(any(Profile.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(restaurantRepository.saveAndFlush(any(Restaurant.class))).thenAnswer(invocation -> {
            Restaurant restaurant = invocation.getArgument(0);
            restaurant.setId(restaurantId);
            return restaurant;
        });
        when(settingsRepository.save(any(RestaurantSettings.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(memberRepository.save(any(RestaurantMember.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        var response = service.createRestaurant(ownerId, new CreateRestaurantRequest(
                "Tea Shop", "tea-shop", "Tea and snacks", "09123456789",
                null, null, null, null, "Min Buri", "Bangkok",
                null, null, null, null, null));

        assertEquals(restaurantId, response.restaurant().id());
        assertEquals("tea-shop", response.restaurant().slug());
        assertEquals("OWNER", response.initialRole());
        assertEquals("MMK", response.currency());
        assertEquals("Asia/Yangon", response.timezone());
        assertEquals(64, response.commonQrToken().length());

        var profileCaptor = org.mockito.ArgumentCaptor.forClass(Profile.class);
        verify(profileRepository).save(profileCaptor.capture());
        assertEquals(ownerId, profileCaptor.getValue().getId());
        assertEquals("my-MM", profileCaptor.getValue().getPreferredLanguage());

        var settingsCaptor = org.mockito.ArgumentCaptor.forClass(RestaurantSettings.class);
        verify(settingsRepository).save(settingsCaptor.capture());
        assertEquals(restaurantId, settingsCaptor.getValue().getRestaurantId());
        assertEquals(response.commonQrToken(), settingsCaptor.getValue().getCommonQrToken());

        var memberCaptor = org.mockito.ArgumentCaptor.forClass(RestaurantMember.class);
        verify(memberRepository).save(memberCaptor.capture());
        assertEquals(restaurantId, memberCaptor.getValue().getRestaurantId());
        assertEquals(ownerId, memberCaptor.getValue().getUserId());
        assertEquals(RestaurantRole.OWNER, memberCaptor.getValue().getRole());
    }

    @Test
    void duplicateRestaurantSlugIsRejectedBeforeCreatingRecords() {
        when(restaurantRepository.existsBySlug("tea-shop")).thenReturn(true);

        ApiException error = assertThrows(ApiException.class,
                () -> service.createRestaurant(ownerId, new CreateRestaurantRequest(
                        "Tea Shop", "tea-shop", null, null, null, null, null, null,
                        "Township", "City", null, null, null, null, null)));

        assertEquals("RESTAURANT_SLUG_EXISTS", error.getCode());
        assertEquals(HttpStatus.CONFLICT, error.getStatus());
        verifyNoInteractions(profileRepository, settingsRepository, memberRepository);
        verify(restaurantRepository, never()).saveAndFlush(any(Restaurant.class));
    }

    @Test
    void invalidTimezoneIsRejectedBeforeDatabaseWrites() {
        when(restaurantRepository.existsBySlug("tea-shop")).thenReturn(false);

        ApiException error = assertThrows(ApiException.class,
                () -> service.createRestaurant(ownerId, new CreateRestaurantRequest(
                        "Tea Shop", "tea-shop", null, null, null, null, null, null,
                        "Township", "City", null, null, null, "MMK", "Not/AZone")));

        assertEquals("INVALID_RESTAURANT_TIMEZONE", error.getCode());
        assertEquals(HttpStatus.BAD_REQUEST, error.getStatus());
        verifyNoInteractions(profileRepository, settingsRepository, memberRepository);
    }
}
