package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.entity.Restaurant;
import com.restaurant.platform.entity.RestaurantMember;
import com.restaurant.platform.repository.RestaurantMemberRepository;
import com.restaurant.platform.repository.RestaurantRepository;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.security.RestaurantRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockMultipartFile;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class RestaurantLogoServiceTest {

    private RestaurantRepository restaurantRepository;
    private RestaurantMemberRepository memberRepository;
    private RestaurantAuthorization authorization;
    private SupabaseStorageClient storageClient;
    private RestaurantLogoService service;

    private final UUID ownerId = UUID.randomUUID();
    private final UUID restaurantId = UUID.randomUUID();
    private final String logoUrl = "https://example.supabase.co/storage/v1/object/public/restaurant-logos/"
            + restaurantId + "/logo?v=version";

    @BeforeEach
    void setUp() {
        restaurantRepository = mock(RestaurantRepository.class);
        memberRepository = mock(RestaurantMemberRepository.class);
        authorization = mock(RestaurantAuthorization.class);
        storageClient = mock(SupabaseStorageClient.class);
        service = new RestaurantLogoService(
                restaurantRepository, memberRepository, authorization, storageClient);

        RestaurantMember owner = new RestaurantMember();
        owner.setRestaurantId(restaurantId);
        owner.setUserId(ownerId);
        owner.setRole(RestaurantRole.OWNER);
        when(memberRepository.findByRestaurantIdAndUserId(restaurantId, ownerId))
                .thenReturn(Optional.of(owner));

        Restaurant restaurant = new Restaurant();
        restaurant.setId(restaurantId);
        restaurant.setName("Test Restaurant");
        restaurant.setSlug("test-restaurant");
        restaurant.setTownship("Township");
        restaurant.setCity("City");
        when(restaurantRepository.findByIdAndIsActiveTrue(restaurantId))
                .thenReturn(Optional.of(restaurant));
        when(restaurantRepository.save(any(Restaurant.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(storageClient.uploadRestaurantLogo(eq(restaurantId), eq("image/png"), any(byte[].class)))
                .thenReturn(logoUrl);
    }

    @Test
    void ownerCanUploadPngAndRestaurantStoresPublicUrl() {
        MockMultipartFile file = new MockMultipartFile(
                "file", "logo.png", "image/png",
                new byte[] {(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A});

        var response = service.upload(restaurantId, ownerId, file);

        assertEquals(restaurantId, response.restaurantId());
        assertEquals(logoUrl, response.logoUrl());
        verify(authorization).requireAuthenticatedUserMatches(ownerId);
        verify(storageClient).uploadRestaurantLogo(
                eq(restaurantId), eq("image/png"), any(byte[].class));
        verify(restaurantRepository).save(argThat(restaurant ->
                logoUrl.equals(restaurant.getLogoUrl())));
    }

    @Test
    void nonOwnerCannotChangeRestaurantLogo() {
        RestaurantMember manager = new RestaurantMember();
        manager.setRestaurantId(restaurantId);
        manager.setUserId(ownerId);
        manager.setRole(RestaurantRole.MANAGER);
        when(memberRepository.findByRestaurantIdAndUserId(restaurantId, ownerId))
                .thenReturn(Optional.of(manager));

        ApiException error = assertThrows(ApiException.class, () -> service.upload(
                restaurantId, ownerId,
                new MockMultipartFile("file", "logo.png", "image/png",
                        new byte[] {(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A})));

        assertEquals(HttpStatus.FORBIDDEN, error.getStatus());
        assertEquals("RESTAURANT_LOGO_OWNER_REQUIRED", error.getCode());
        verifyNoInteractions(storageClient);
        verify(restaurantRepository, never()).save(any(Restaurant.class));
    }

    @Test
    void uploadRejectsMimeTypeThatDoesNotMatchFileSignature() {
        MockMultipartFile file = new MockMultipartFile(
                "file", "not-really-png.png", "image/png", "not an image".getBytes());

        ApiException error = assertThrows(ApiException.class,
                () -> service.upload(restaurantId, ownerId, file));

        assertEquals(HttpStatus.UNSUPPORTED_MEDIA_TYPE, error.getStatus());
        assertEquals("RESTAURANT_LOGO_CONTENT_MISMATCH", error.getCode());
        verifyNoInteractions(storageClient);
        verify(restaurantRepository, never()).save(any(Restaurant.class));
    }

    @Test
    void uploadRejectsFilesLargerThanFiveMegabytes() {
        byte[] tooLarge = new byte[(int) RestaurantLogoService.MAX_LOGO_BYTES + 1];
        MockMultipartFile file = new MockMultipartFile(
                "file", "large.png", "image/png", tooLarge);

        ApiException error = assertThrows(ApiException.class,
                () -> service.upload(restaurantId, ownerId, file));

        assertEquals(HttpStatus.PAYLOAD_TOO_LARGE, error.getStatus());
        assertEquals("RESTAURANT_LOGO_TOO_LARGE", error.getCode());
        verifyNoInteractions(storageClient);
    }
}
