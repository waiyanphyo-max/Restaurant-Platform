package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.member.RestaurantMemberRequest;
import com.restaurant.platform.dto.member.RestaurantMemberResponse;
import com.restaurant.platform.dto.member.TransferRestaurantOwnershipRequest;
import com.restaurant.platform.dto.member.TransferRestaurantOwnershipResponse;
import com.restaurant.platform.entity.Profile;
import com.restaurant.platform.entity.RestaurantMember;
import com.restaurant.platform.entity.RestaurantSettings;
import com.restaurant.platform.repository.ProfileRepository;
import com.restaurant.platform.repository.RestaurantMemberRepository;
import com.restaurant.platform.repository.RestaurantSettingsRepository;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.security.RestaurantPermission;
import com.restaurant.platform.security.RestaurantRole;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Service
public class RestaurantMemberService {

    private final RestaurantMemberRepository memberRepository;
    private final ProfileRepository profileRepository;
    private final RestaurantSettingsRepository settingsRepository;
    private final RestaurantAuthorization authorization;

    public RestaurantMemberService(
            RestaurantMemberRepository memberRepository,
            ProfileRepository profileRepository,
            RestaurantSettingsRepository settingsRepository,
            RestaurantAuthorization authorization) {
        this.memberRepository = memberRepository;
        this.profileRepository = profileRepository;
        this.settingsRepository = settingsRepository;
        this.authorization = authorization;
    }

    @Transactional(readOnly = true)
    public List<RestaurantMemberResponse> list(UUID restaurantId, UUID actorUserId) {
        requireMemberManagement(restaurantId, actorUserId);
        return memberRepository.findByRestaurantIdOrderByCreatedAtAsc(restaurantId)
                .stream().map(this::toResponse).toList();
    }

    /**
     * Transfers ownership to an existing member. The former owner becomes MANAGER,
     * preserving operational access without leaving two owner accounts.
     */
    @Transactional
    public TransferRestaurantOwnershipResponse transferOwnership(
            UUID restaurantId, UUID actorUserId,
            TransferRestaurantOwnershipRequest request) {
        authorization.requireAuthenticatedUserMatches(actorUserId);
        authorization.requirePermission(restaurantId, RestaurantPermission.MEMBERS_MANAGE);

        if (request == null || request.newOwnerUserId() == null
                || actorUserId.equals(request.newOwnerUserId())) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "OWNER_TRANSFER_TARGET_REQUIRED",
                    "error.member.transfer-target-required");
        }

        RestaurantMember currentOwner = memberRepository
                .findByRestaurantIdAndUserIdForUpdate(restaurantId, actorUserId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.FORBIDDEN,
                        "OWNER_TRANSFER_FORBIDDEN",
                        "error.member.owner-required"));
        if (currentOwner.getRole() != RestaurantRole.OWNER) {
            throw new ApiException(HttpStatus.FORBIDDEN,
                    "OWNER_TRANSFER_FORBIDDEN",
                    "error.member.owner-required");
        }

        RestaurantMember newOwner = memberRepository
                .findByRestaurantIdAndUserIdForUpdate(
                        restaurantId, request.newOwnerUserId())
                .orElseThrow(() -> new ApiException(
                        HttpStatus.BAD_REQUEST,
                        "OWNER_TRANSFER_TARGET_NOT_MEMBER",
                        "error.member.transfer-target-not-member"));
        if (newOwner.getRole() == RestaurantRole.OWNER) {
            throw new ApiException(HttpStatus.CONFLICT,
                    "OWNER_TRANSFER_TARGET_ALREADY_OWNER",
                    "error.member.transfer-target-already-owner");
        }

        UUID newOwnerUserId = newOwner.getUserId();
        clearDefaultDriverIfNeeded(restaurantId, newOwnerUserId, RestaurantRole.OWNER);

        // One transaction guarantees that the ownership transition commits together.
        newOwner.setRole(RestaurantRole.OWNER);
        currentOwner.setRole(RestaurantRole.MANAGER);
        memberRepository.save(newOwner);
        memberRepository.save(currentOwner);

        return new TransferRestaurantOwnershipResponse(
                restaurantId,
                currentOwner.getUserId(),
                newOwnerUserId,
                RestaurantRole.MANAGER.name(),
                RestaurantRole.OWNER.name());
    }

    @Transactional
    public RestaurantMemberResponse add(
            UUID restaurantId, UUID actorUserId, RestaurantMemberRequest request) {
        requireMemberManagement(restaurantId, actorUserId);
        validate(request);
        Profile profile = profileRepository.findById(request.userId())
                .orElseThrow(() -> new ApiException(
                        HttpStatus.BAD_REQUEST,
                        "PROFILE_REQUIRED",
                        "error.member.profile-required"));
        if (memberRepository.findByRestaurantIdAndUserId(restaurantId, profile.getId()).isPresent()) {
            throw new ApiException(HttpStatus.CONFLICT,
                    "RESTAURANT_MEMBER_EXISTS", "error.member.already-exists");
        }

        RestaurantMember member = new RestaurantMember();
        member.setRestaurantId(restaurantId);
        member.setUserId(profile.getId());
        member.setRole(parseAllowedRole(request.role()));
        return toResponse(memberRepository.save(member));
    }

    @Transactional
    public RestaurantMemberResponse update(
            UUID restaurantId, UUID actorUserId, UUID memberId,
            RestaurantMemberRequest request) {
        requireMemberManagement(restaurantId, actorUserId);
        validate(request);
        RestaurantMember member = memberRepository.findByIdAndRestaurantId(memberId, restaurantId)
                .orElseThrow(() -> memberNotFound());
        if (!member.getUserId().equals(request.userId())) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "MEMBER_USER_ID_IMMUTABLE", "error.member.user-id-immutable");
        }

        RestaurantRole newRole = parseAllowedRole(request.role());
        if (member.getRole() == RestaurantRole.OWNER) {
            throw new ApiException(HttpStatus.CONFLICT,
                    "OWNER_ROLE_TRANSFER_REQUIRED",
                    "error.member.owner-role-protected");
        }
        clearDefaultDriverIfNeeded(restaurantId, member.getUserId(), newRole);
        member.setRole(newRole);
        return toResponse(memberRepository.save(member));
    }

    @Transactional
    public void remove(UUID restaurantId, UUID actorUserId, UUID memberId) {
        requireMemberManagement(restaurantId, actorUserId);
        RestaurantMember member = memberRepository.findByIdAndRestaurantId(memberId, restaurantId)
                .orElseThrow(() -> memberNotFound());
        if (member.getRole() == RestaurantRole.OWNER) {
            throw new ApiException(HttpStatus.CONFLICT,
                    "OWNER_ROLE_TRANSFER_REQUIRED",
                    "error.member.owner-role-protected");
        }
        clearDefaultDriverIfNeeded(restaurantId, member.getUserId(), null);
        memberRepository.delete(member);
    }

    private void clearDefaultDriverIfNeeded(
            UUID restaurantId, UUID targetUserId, RestaurantRole nextRole) {
        if (nextRole == RestaurantRole.DELIVERY_DRIVER) {
            return;
        }
        settingsRepository.findById(restaurantId).ifPresent(settings -> {
            if (targetUserId.equals(settings.getDefaultDeliveryDriverUserId())) {
                settings.setDefaultDeliveryDriverUserId(null);
                settingsRepository.save(settings);
            }
        });
    }

    private void validate(RestaurantMemberRequest request) {
        if (request == null || request.userId() == null
                || request.role() == null || request.role().isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "INVALID_MEMBER_REQUEST", "error.member.invalid-request");
        }
    }

    private RestaurantRole parseAllowedRole(String rawRole) {
        try {
            RestaurantRole role = RestaurantRole.valueOf(rawRole.trim().toUpperCase(Locale.ROOT));
            if (role == RestaurantRole.OWNER) {
                throw new IllegalArgumentException("OWNER assignment is not available here");
            }
            return role;
        } catch (IllegalArgumentException exception) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "INVALID_MEMBER_ROLE", "error.member.invalid-role");
        }
    }

    private void requireMemberManagement(UUID restaurantId, UUID actorUserId) {
        authorization.requireAuthenticatedUserMatches(actorUserId);
        authorization.requirePermission(restaurantId, RestaurantPermission.MEMBERS_MANAGE);
    }

    private RestaurantMemberResponse toResponse(RestaurantMember member) {
        return new RestaurantMemberResponse(
                member.getId(), member.getRestaurantId(), member.getUserId(),
                member.getRole().name(), member.getCreatedAt());
    }

    private ApiException memberNotFound() {
        return new ApiException(HttpStatus.NOT_FOUND,
                "RESTAURANT_MEMBER_NOT_FOUND", "error.member.not-found");
    }
}
