package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.platform.PlatformRestaurantProvisionRequest;
import com.restaurant.platform.dto.platform.PlatformRestaurantProvisionResponse;
import com.restaurant.platform.dto.restaurant.RestaurantOnboardingResponse;
import com.restaurant.platform.entity.Profile;
import com.restaurant.platform.repository.ProfileRepository;
import com.restaurant.platform.security.PlatformAdminAuthorization;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.util.UriComponentsBuilder;

import java.util.Locale;
import java.util.UUID;

@Service
public class PlatformRestaurantProvisioningService {
    private final PlatformAdminAuthorization platformAdminAuthorization;
    private final SupabaseAuthAdminClient supabaseAuthAdminClient;
    private final ProfileRepository profileRepository;
    private final RestaurantManagementService restaurantManagementService;
    private final String publicWebBaseUrl;

    public PlatformRestaurantProvisioningService(
            PlatformAdminAuthorization platformAdminAuthorization,
            SupabaseAuthAdminClient supabaseAuthAdminClient,
            ProfileRepository profileRepository,
            RestaurantManagementService restaurantManagementService,
            @Value("${app.public-web-base-url:http://localhost:3000}") String publicWebBaseUrl) {
        this.platformAdminAuthorization = platformAdminAuthorization;
        this.supabaseAuthAdminClient = supabaseAuthAdminClient;
        this.profileRepository = profileRepository;
        this.restaurantManagementService = restaurantManagementService;
        this.publicWebBaseUrl = publicWebBaseUrl == null
                ? "http://localhost:3000"
                : publicWebBaseUrl.trim().replaceAll("/+$", "");
    }

    public PlatformRestaurantProvisionResponse provision(
            PlatformRestaurantProvisionRequest request) {
        platformAdminAuthorization.requirePlatformAdmin();
        if (request == null || request.restaurant() == null
                || request.ownerEmail() == null || request.ownerEmail().isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "INVALID_PLATFORM_PROVISION_REQUEST",
                    "error.platform-admin.invalid-request");
        }

        String email = request.ownerEmail().trim().toLowerCase(Locale.ROOT);

        // Validate the restaurant data before creating an external Auth invitation.
        restaurantManagementService.validatePlatformProvisioningRequest(request.restaurant());

        Profile profile = profileRepository.findFirstByEmailIgnoreCase(email).orElse(null);
        boolean invitationSent = false;

        if (profile == null) {
            SupabaseAuthAdminClient.AuthUser invitedUser = null;
            try {
                invitedUser = supabaseAuthAdminClient.inviteByEmail(email, request.ownerFullName());
                invitationSent = true;
            } catch (SupabaseAuthAdminException exception) {
                if (exception.isConfigurationError()) {
                    throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                            "PLATFORM_OWNER_INVITATION_NOT_CONFIGURED",
                            "error.member.invitation-not-configured");
                }
                if (exception.isAlreadyRegistered()) {
                    // This also makes retries recoverable if an invitation was created
                    // successfully but the subsequent restaurant transaction failed.
                    profile = profileRepository.findFirstByEmailIgnoreCase(email).orElse(null);
                    if (profile == null) {
                        throw new ApiException(HttpStatus.CONFLICT,
                                "PLATFORM_OWNER_EMAIL_ALREADY_REGISTERED",
                                "error.member.email-already-registered");
                    }
                } else {
                    throw new ApiException(HttpStatus.BAD_GATEWAY,
                            "PLATFORM_OWNER_INVITATION_PROVIDER_ERROR",
                            "error.member.invitation-provider-error");
                }
            }

            if (profile == null) {
                if (invitedUser == null || invitedUser.id() == null) {
                    throw new ApiException(HttpStatus.BAD_GATEWAY,
                            "PLATFORM_OWNER_INVITATION_INVALID_RESPONSE",
                            "error.member.invitation-provider-error");
                }
                profile = profileRepository.findById(invitedUser.id()).orElseGet(() ->
                        profileRepository.findFirstByEmailIgnoreCase(email).orElse(null));
                if (profile == null) {
                    throw new ApiException(HttpStatus.BAD_GATEWAY,
                            "PLATFORM_OWNER_PROFILE_MISSING",
                            "error.member.invitation-profile-missing");
                }
            }
        }

        if (request.ownerFullName() != null && !request.ownerFullName().isBlank()
                && (profile.getFullName() == null || profile.getFullName().isBlank())) {
            profile.setFullName(request.ownerFullName().trim());
            profileRepository.save(profile);
        }

        RestaurantOnboardingResponse onboarding =
                restaurantManagementService.createRestaurantForPlatformAdmin(
                        profile.getId(), request.restaurant());

        UUID restaurantId = onboarding.restaurant().id();
        String ownerWorkspaceUrl = UriComponentsBuilder
                .fromUriString(publicWebBaseUrl)
                .path("/workspace")
                .queryParam("restaurantId", restaurantId)
                .build()
                .encode()
                .toUriString();

        String commonQrUrl = UriComponentsBuilder
                .fromUriString(publicWebBaseUrl)
                .path("/")
                .queryParam("view", "customer-pickup")
                .queryParam("restaurantId", restaurantId)
                .fragment("qrToken=" + onboarding.commonQrToken())
                .build()
                .encode()
                .toUriString();

        // The raw Common QR credential is returned only during provisioning/rotation.
        // Never persist or log this response payload in the platform dashboard.
        return new PlatformRestaurantProvisionResponse(
                profile.getId(),
                email,
                invitationSent,
                onboarding.initialRole(),
                onboarding.restaurant(),
                ownerWorkspaceUrl,
                commonQrUrl,
                onboarding.commonQrToken());
    }
}
