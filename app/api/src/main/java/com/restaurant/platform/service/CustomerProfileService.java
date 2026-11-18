package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.customer.CustomerProfileRequest;
import com.restaurant.platform.dto.customer.CustomerProfileResponse;
import com.restaurant.platform.entity.Profile;
import com.restaurant.platform.repository.ProfileRepository;
import com.restaurant.platform.security.RestaurantAuthorization;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

import java.util.Set;
import java.util.UUID;

@Service
public class CustomerProfileService {

    private static final Set<String> SUPPORTED_LANGUAGES = Set.of("my-MM", "en");

    private final ProfileRepository profileRepository;
    private final RestaurantAuthorization authorization;
    private final SupabaseMediaStorageClient storageClient;

    /** Kept for focused service tests that do not exercise avatar signing. */
    public CustomerProfileService(
            ProfileRepository profileRepository,
            RestaurantAuthorization authorization) {
        this(profileRepository, authorization, null);
    }

    @Autowired
    public CustomerProfileService(
            ProfileRepository profileRepository,
            RestaurantAuthorization authorization,
            SupabaseMediaStorageClient storageClient) {
        this.profileRepository = profileRepository;
        this.authorization = authorization;
        this.storageClient = storageClient;
    }

    @Transactional
    public CustomerProfileResponse getMyProfile(UUID userId) {
        authorization.requireAuthenticatedUserMatches(userId);
        Profile profile = profileRepository.findById(userId)
                .orElseGet(() -> {
                    // Auth and public profile creation can become out of sync if
                    // the signup trigger was missing. Repair only a real, active
                    // Auth identity; the unique key makes concurrent reads safe.
                    profileRepository.restoreMissingFromAuthUser(userId);
                    return profileRepository.findById(userId).orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "CUSTOMER_PROFILE_NOT_FOUND",
                        "error.customer-profile.not-found"));
                });
        return toResponse(profile);
    }

    @Transactional
    public CustomerProfileResponse updateMyProfile(
            UUID userId, CustomerProfileRequest request) {
        authorization.requireAuthenticatedUserMatches(userId);
        if (request == null
                || request.fullName() == null || request.fullName().isBlank()
                || request.phone() == null || request.phone().isBlank()
                || request.preferredLanguage() == null
                || !SUPPORTED_LANGUAGES.contains(request.preferredLanguage())) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "INVALID_CUSTOMER_PROFILE",
                    "error.customer-profile.invalid");
        }

        Profile profile = profileRepository.findById(userId).orElseGet(() -> {
            Profile created = new Profile();
            created.setId(userId);
            return created;
        });
        profile.setFullName(request.fullName().trim());
        profile.setPhone(request.phone().trim());
        profile.setPreferredLanguage(request.preferredLanguage());
        return toResponse(profileRepository.save(profile));
    }

    private CustomerProfileResponse toResponse(Profile profile) {
        String avatarUrl = profile.getAvatarUrl();
        if (profile.getAvatarPath() != null && !profile.getAvatarPath().isBlank()
                && storageClient != null) {
            // An optional private photo must not prevent profile/address loading
            // and checkout when Storage is unavailable. Keep its durable path so
            // a later profile request can sign it again after service recovery.
            avatarUrl = null;
            try {
                avatarUrl = storageClient.createSignedAvatarUrl(profile.getAvatarPath());
            } catch (ApiException exception) {
                if (!Set.of("MEDIA_STORAGE_NOT_CONFIGURED", "MEDIA_STORAGE_OPERATION_FAILED")
                        .contains(exception.getCode())) {
                    throw exception;
                }
            }
        }
        return new CustomerProfileResponse(
                profile.getId(), profile.getFullName(), profile.getPhone(),
                profile.getPreferredLanguage(), profile.getCreatedAt(),
                profile.getUpdatedAt(), avatarUrl);
    }
}
