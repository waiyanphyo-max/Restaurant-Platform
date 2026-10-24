package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.member.RestaurantMemberRequest;
import com.restaurant.platform.dto.member.InviteRestaurantMemberRequest;
import com.restaurant.platform.dto.member.TransferRestaurantOwnershipRequest;
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
    private SupabaseAuthAdminClient supabaseAuthAdminClient;
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
        supabaseAuthAdminClient = mock(SupabaseAuthAdminClient.class);
        service = new RestaurantMemberService(
                memberRepository, profileRepository, settingsRepository,
                authorization, supabaseAuthAdminClient);
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
    void ownerCanTransferOwnershipToExistingMemberAndBecomesManager() {
        RestaurantMember currentOwner = member(ownerId, RestaurantRole.OWNER);
        RestaurantMember target = member(targetUserId, RestaurantRole.STAFF);
        when(memberRepository.findByRestaurantIdAndUserIdForUpdate(restaurantId, ownerId))
                .thenReturn(Optional.of(currentOwner));
        when(memberRepository.findByRestaurantIdAndUserIdForUpdate(restaurantId, targetUserId))
                .thenReturn(Optional.of(target));

        var response = service.transferOwnership(
                restaurantId, ownerId, new TransferRestaurantOwnershipRequest(targetUserId));

        assertEquals(restaurantId, response.restaurantId());
        assertEquals(ownerId, response.previousOwnerUserId());
        assertEquals(targetUserId, response.newOwnerUserId());
        assertEquals("MANAGER", response.previousOwnerRole());
        assertEquals("OWNER", response.newOwnerRole());
        assertEquals(RestaurantRole.MANAGER, currentOwner.getRole());
        assertEquals(RestaurantRole.OWNER, target.getRole());
        verify(memberRepository).save(target);
        verify(memberRepository).save(currentOwner);
        verify(authorization).requireAuthenticatedUserMatches(ownerId);
        verify(authorization).requirePermission(
                restaurantId, RestaurantPermission.MEMBERS_MANAGE);
    }

    @Test
    void nonOwnerCannotTransferOwnershipEvenIfMemberPermissionCheckPasses() {
        RestaurantMember currentMember = member(ownerId, RestaurantRole.MANAGER);
        when(memberRepository.findByRestaurantIdAndUserIdForUpdate(restaurantId, ownerId))
                .thenReturn(Optional.of(currentMember));

        ApiException error = assertThrows(ApiException.class, () ->
                service.transferOwnership(
                        restaurantId, ownerId,
                        new TransferRestaurantOwnershipRequest(targetUserId)));

        assertEquals("OWNER_TRANSFER_FORBIDDEN", error.getCode());
        assertEquals(HttpStatus.FORBIDDEN, error.getStatus());
        verify(memberRepository, never()).save(any(RestaurantMember.class));
        verify(memberRepository, never())
                .findByRestaurantIdAndUserIdForUpdate(restaurantId, targetUserId);
    }

    @Test
    void ownershipTransferRejectsTargetOutsideRestaurant() {
        RestaurantMember currentOwner = member(ownerId, RestaurantRole.OWNER);
        when(memberRepository.findByRestaurantIdAndUserIdForUpdate(restaurantId, ownerId))
                .thenReturn(Optional.of(currentOwner));
        when(memberRepository.findByRestaurantIdAndUserIdForUpdate(restaurantId, targetUserId))
                .thenReturn(Optional.empty());

        ApiException error = assertThrows(ApiException.class, () ->
                service.transferOwnership(
                        restaurantId, ownerId,
                        new TransferRestaurantOwnershipRequest(targetUserId)));

        assertEquals("OWNER_TRANSFER_TARGET_NOT_MEMBER", error.getCode());
        assertEquals(HttpStatus.BAD_REQUEST, error.getStatus());
        verify(memberRepository, never()).save(any(RestaurantMember.class));
    }

    @Test
    void ownershipCannotBeTransferredToCurrentOwner() {
        ApiException error = assertThrows(ApiException.class, () ->
                service.transferOwnership(
                        restaurantId, ownerId,
                        new TransferRestaurantOwnershipRequest(ownerId)));

        assertEquals("OWNER_TRANSFER_TARGET_REQUIRED", error.getCode());
        verify(memberRepository, never()).findByRestaurantIdAndUserIdForUpdate(
                any(UUID.class), any(UUID.class));
    }


    @Test
    void ownerCanInviteNewEmailAndCreateRestaurantMembership() {
        String email = "new.staff@example.com";
        Profile profile = new Profile();
        profile.setId(targetUserId);
        profile.setEmail(email);
        profile.setFullName("New Staff");
        when(supabaseAuthAdminClient.inviteByEmail(email, "New Staff"))
                .thenReturn(new SupabaseAuthAdminClient.AuthUser(targetUserId, email));
        when(profileRepository.findById(targetUserId)).thenReturn(Optional.of(profile));
        when(memberRepository.findByRestaurantIdAndUserId(restaurantId, targetUserId))
                .thenReturn(Optional.empty());
        when(memberRepository.save(any(RestaurantMember.class))).thenAnswer(invocation -> {
            RestaurantMember member = invocation.getArgument(0);
            member.setId(memberId);
            return member;
        });

        var response = service.invite(restaurantId, ownerId,
                new InviteRestaurantMemberRequest(email, "New Staff", "STAFF"));

        assertEquals(memberId, response.id());
        assertEquals(targetUserId, response.userId());
        assertEquals(email, response.email());
        assertEquals("New Staff", response.fullName());
        assertEquals("STAFF", response.role());
        verify(authorization).requireAuthenticatedUserMatches(ownerId);
        verify(authorization).requirePermission(restaurantId, RestaurantPermission.MEMBERS_MANAGE);
        verify(supabaseAuthAdminClient).inviteByEmail(email, "New Staff");
    }

    @Test
    void invitationRejectsEmailAlreadyUsedByAnotherSupabaseAccount() {
        when(supabaseAuthAdminClient.inviteByEmail("existing@example.com", null))
                .thenThrow(new SupabaseAuthAdminException("already registered", false, true, null));

        ApiException error = assertThrows(ApiException.class, () ->
                service.invite(restaurantId, ownerId,
                        new InviteRestaurantMemberRequest("existing@example.com", null, "STAFF")));

        assertEquals("MEMBER_EMAIL_ALREADY_REGISTERED", error.getCode());
        assertEquals(HttpStatus.CONFLICT, error.getStatus());
        verify(memberRepository, never()).save(any(RestaurantMember.class));
    }

    private RestaurantMember member(UUID userId, RestaurantRole role) {
        RestaurantMember member = new RestaurantMember();
        member.setId(UUID.randomUUID());
        member.setRestaurantId(restaurantId);
        member.setUserId(userId);
        member.setRole(role);
        return member;
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
