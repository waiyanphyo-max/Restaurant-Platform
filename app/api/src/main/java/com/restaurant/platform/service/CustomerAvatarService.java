package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.customer.CustomerProfileResponse;
import com.restaurant.platform.entity.Profile;
import com.restaurant.platform.repository.ProfileRepository;
import com.restaurant.platform.security.RestaurantAuthorization;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.util.UUID;

/** Uploads customer avatars to a private bucket and keeps only the object path in the database. */
@Service
public class CustomerAvatarService {
    public static final long MAX_AVATAR_BYTES = 2L * 1024L * 1024L;

    private final ProfileRepository profileRepository;
    private final RestaurantAuthorization authorization;
    private final ImageUploadValidator imageValidator;
    private final SupabaseMediaStorageClient storageClient;
    private final CustomerProfileService customerProfileService;

    public CustomerAvatarService(
            ProfileRepository profileRepository,
            RestaurantAuthorization authorization,
            ImageUploadValidator imageValidator,
            SupabaseMediaStorageClient storageClient,
            CustomerProfileService customerProfileService) {
        this.profileRepository = profileRepository;
        this.authorization = authorization;
        this.imageValidator = imageValidator;
        this.storageClient = storageClient;
        this.customerProfileService = customerProfileService;
    }

    public CustomerProfileResponse upload(UUID userId, MultipartFile file) {
        authorization.requireAuthenticatedUserMatches(userId);
        ImageUploadValidator.ValidatedImage image =
                imageValidator.validate(file, MAX_AVATAR_BYTES);

        Profile profile = profileRepository.findById(userId).orElseGet(() -> {
            Profile created = new Profile();
            created.setId(userId);
            return created;
        });

        String objectPath = userId + "/" + UUID.randomUUID() + "." + image.extension();
        storageClient.uploadPrivateAvatar(objectPath, image.contentType(), image.bytes());
        profile.setAvatarPath(objectPath);
        // Do not store an expiring signed URL. Retain avatar_url only for legacy public URLs.
        profile.setAvatarUrl(null);
        profileRepository.save(profile);
        return customerProfileService.getMyProfile(userId);
    }

    private ApiException storageNotConfigured() {
        return new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                "MEDIA_STORAGE_NOT_CONFIGURED", "error.media.storage-not-configured");
    }
}
