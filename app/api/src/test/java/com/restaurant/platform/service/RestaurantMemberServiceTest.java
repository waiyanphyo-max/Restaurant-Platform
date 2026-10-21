package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.member.RestaurantMemberRequest;
import com.restaurant.platform.entity.Profile;
import com.restaurant.platform.entity.RestaurantMember;
import com.restaurant.platform.entity.RestaurantSettings;
import com.restaurant.platform.repository.ProfileRepository;
import com.restaurant.platform.repository.RestaurantMemberRepository;
import com.restaurant.platform.repository.RestaurantSettingsRepository;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.security.RestaurantPermission;
import com.restaurant.platform.security.RestaurantRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import java.util.Optional;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class RestaurantMemberServiceTest {
    private RestaurantMemberRepository memberRepository;
    private ProfileRepository profileRepository;
    private RestaurantSettingsRepository settingsRepository;
    private RestaurantAuthorization authorization;
    private RestaurantMemberService service;
    private final UUID restaurantId = UUID.randomUUID();
    private final UUID ownerId = UUID.randomUUID();
    private final UUID targetUserId = UUID.randomUUID();
    private final UUID memberId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        memberRepository = mock(RestaurantMemberRepository.class);
        profileRepository = mock(ProfileRepository.class);
        settingsRepository = mock(RestaurantSettingsRepository.class);
        authorization = mock(RestaurantAuthorization.class);
        service = new RestaurantMemberService(
                memberRepository, profileRepository, settingsRepository, authorization);
    }

    @Test
    void ownerCanAddExistingProfileAsDeliveryDriver() {
        Profile profile = new Profile();
        profile.setId(targetUserId);
        when(profileRepository.findById(targetUserId)).thenReturn(Optional.of(profile));
        when(memberRepository.findByRestaurantIdAndUserId(restaurantId, targetUserId))
                .thenReturn(Optional.empty());
        when(memberRepository.save(any(RestaurantMember.class))).thenAnswer(invocation -> {
            RestaurantMember member = invocation.getArgument(0);
            member.setId(memberId);
            return member;
        });

        var response = service.add(restaurantId, ownerId,
                new RestaurantMemberRequest(targetUserId, "DELIVERY_DRIVER"));

        assertEquals(memberId, response.id());
        assertEquals(targetUserId, response.userId());
        assertEquals("DELIVERY_DRIVER", response.role());
        verify(authorization).requirePermission(restaurantId, RestaurantPermission.MEMBERS_MANAGE);
    }

    @Test
    void addRejectsUserWithoutProfile() {
        when(profileRepository.findById(targetUserId)).thenReturn(Optional.empty());

        ApiException error = assertThrows(ApiException.class, () ->
                service.add(restaurantId, ownerId,
                        new RestaurantMemberRequest(targetUserId, "STAFF")));

        assertEquals("PROFILE_REQUIRED", error.getCode());
        assertEquals(HttpStatus.BAD_REQUEST, error.getStatus());
        verify(memberRepository, never()).save(any(RestaurantMember.class));
    }

    @Test
    void duplicateMembershipIsRejected() {
        Profile profile = new Profile();
        profile.setId(targetUserId);
        RestaurantMember existing = new RestaurantMember();
        existing.setUserId(targetUserId);
        when(profileRepository.findById(targetUserId)).thenReturn(Optional.of(profile));
        when(memberRepository.findByRestaurantIdAndUserId(restaurantId, targetUserId))
                .thenReturn(Optional.of(existing));

        ApiException error = assertThrows(ApiException.class, () ->
                service.add(restaurantId, ownerId,
                        new RestaurantMemberRequest(targetUserId, "STAFF")));

        assertEquals("RESTAURANT_MEMBER_EXISTS", error.getCode());
        verify(memberRepository, never()).save(any(RestaurantMember.class));
    }

    @Test
    void deletingDefaultDriverClearsRestaurantDefaultDriver() {
        RestaurantMember member = new RestaurantMember();
        member.setId(memberId);
        member.setRestaurantId(restaurantId);
        member.setUserId(targetUserId);
        member.setRole(RestaurantRole.DELIVERY_DRIVER);
        RestaurantSettings settings = new RestaurantSettings();
        settings.setRestaurantId(restaurantId);
        settings.setDefaultDeliveryDriverUserId(targetUserId);
        when(memberRepository.findByIdAndRestaurantId(memberId, restaurantId))
                .thenReturn(Optional.of(member));
        when(settingsRepository.findById(restaurantId)).thenReturn(Optional.of(settings));

        service.remove(restaurantId, ownerId, memberId);

        assertNull(settings.getDefaultDeliveryDriverUserId());
        verify(settingsRepository).save(settings);
        verify(memberRepository).delete(member);
    }

    @Test
    void ownerMembershipCannotBeRemovedThroughGeneralMemberEndpoint() {
        RestaurantMember owner = new RestaurantMember();
        owner.setId(memberId);
        owner.setRestaurantId(restaurantId);
        owner.setUserId(targetUserId);
        owner.setRole(RestaurantRole.OWNER);
        when(memberRepository.findByIdAndRestaurantId(memberId, restaurantId))
                .thenReturn(Optional.of(owner));

        ApiException error = assertThrows(ApiException.class,
                () -> service.remove(restaurantId, ownerId, memberId));

        assertEquals("OWNER_ROLE_TRANSFER_REQUIRED", error.getCode());
        verify(memberRepository, never()).delete(any(RestaurantMember.class));
    }
}
