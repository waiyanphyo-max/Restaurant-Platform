package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.restaurant.RestaurantLogoResponse;
import com.restaurant.platform.entity.Restaurant;
import com.restaurant.platform.entity.RestaurantMember;
import com.restaurant.platform.repository.RestaurantMemberRepository;
import com.restaurant.platform.repository.RestaurantRepository;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.security.RestaurantRole;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/** Owner-only restaurant logo validation and upload workflow. */
@Service
public class RestaurantLogoService {

    public static final long MAX_LOGO_BYTES = 5L * 1024L * 1024L;

    private static final Map<String, String> SUPPORTED_TYPES = Map.of(
            "image/png", "png",
            "image/jpeg", "jpg",
            "image/webp", "webp");

    private final RestaurantRepository restaurantRepository;
    private final RestaurantMemberRepository memberRepository;
    private final RestaurantAuthorization authorization;
    private final SupabaseStorageClient storageClient;

    public RestaurantLogoService(
            RestaurantRepository restaurantRepository,
            RestaurantMemberRepository memberRepository,
            RestaurantAuthorization authorization,
            SupabaseStorageClient storageClient) {
        this.restaurantRepository = restaurantRepository;
        this.memberRepository = memberRepository;
        this.authorization = authorization;
        this.storageClient = storageClient;
    }

    public RestaurantLogoResponse upload(UUID restaurantId, UUID actorUserId, MultipartFile file) {
        authorization.requireAuthenticatedUserMatches(actorUserId);
        requireOwner(restaurantId, actorUserId);

        Restaurant restaurant = restaurantRepository.findByIdAndIsActiveTrue(restaurantId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "RESTAURANT_NOT_FOUND",
                        "error.restaurant.not-found"));

        if (file == null || file.isEmpty()) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "INVALID_RESTAURANT_LOGO",
                    "error.logo.invalid-file");
        }
        if (file.getSize() > MAX_LOGO_BYTES) {
            throw new ApiException(
                    HttpStatus.PAYLOAD_TOO_LARGE,
                    "RESTAURANT_LOGO_TOO_LARGE",
                    "error.logo.file-too-large");
        }

        String contentType = file.getContentType() == null
                ? "" : file.getContentType().trim().toLowerCase(Locale.ROOT);
        if (!SUPPORTED_TYPES.containsKey(contentType)) {
            throw new ApiException(
                    HttpStatus.UNSUPPORTED_MEDIA_TYPE,
                    "UNSUPPORTED_RESTAURANT_LOGO_TYPE",
                    "error.logo.invalid-file");
        }

        final byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException exception) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "RESTAURANT_LOGO_READ_FAILED",
                    "error.logo.invalid-file");
        }

        if (!matchesSignature(contentType, bytes)) {
            throw new ApiException(
                    HttpStatus.UNSUPPORTED_MEDIA_TYPE,
                    "RESTAURANT_LOGO_CONTENT_MISMATCH",
                    "error.logo.invalid-file");
        }

        String logoUrl = storageClient.uploadRestaurantLogo(restaurantId, contentType, bytes);
        restaurant.setLogoUrl(logoUrl);
        restaurantRepository.save(restaurant);
        return new RestaurantLogoResponse(restaurantId, logoUrl);
    }

    private void requireOwner(UUID restaurantId, UUID actorUserId) {
        RestaurantMember member = memberRepository
                .findByRestaurantIdAndUserId(restaurantId, actorUserId)
                .orElseThrow(this::ownerRequired);
        if (member.getRole() != RestaurantRole.OWNER) {
            throw ownerRequired();
        }
    }

    private ApiException ownerRequired() {
        return new ApiException(
                HttpStatus.FORBIDDEN,
                "RESTAURANT_LOGO_OWNER_REQUIRED",
                "error.logo.owner-required");
    }

    private boolean matchesSignature(String contentType, byte[] bytes) {
        return switch (contentType) {
            case "image/png" -> bytes.length >= 8
                    && bytes[0] == (byte) 0x89
                    && bytes[1] == 0x50
                    && bytes[2] == 0x4E
                    && bytes[3] == 0x47
                    && bytes[4] == 0x0D
                    && bytes[5] == 0x0A
                    && bytes[6] == 0x1A
                    && bytes[7] == 0x0A;
            case "image/jpeg" -> bytes.length >= 3
                    && bytes[0] == (byte) 0xFF
                    && bytes[1] == (byte) 0xD8
                    && bytes[2] == (byte) 0xFF;
            case "image/webp" -> bytes.length >= 12
                    && bytes[0] == 'R'
                    && bytes[1] == 'I'
                    && bytes[2] == 'F'
                    && bytes[3] == 'F'
                    && bytes[8] == 'W'
                    && bytes[9] == 'E'
                    && bytes[10] == 'B'
                    && bytes[11] == 'P';
            default -> false;
        };
    }
}
