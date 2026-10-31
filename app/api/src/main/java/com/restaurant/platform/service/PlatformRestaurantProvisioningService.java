package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.platform.PlatformRestaurantProvisionRequest;
import com.restaurant.platform.dto.platform.PlatformRestaurantProvisionResponse;
import com.restaurant.platform.dto.restaurant.RestaurantOnboardingResponse;
import com.restaurant.platform.entity.Profile;
import com.restaurant.platform.repository.ProfileRepository;
import com.restaurant.platform.security.PlatformAdminAuthorization;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.util.Locale;

@Service
public class PlatformRestaurantProvisioningService {
    private final PlatformAdminAuthorization platformAdminAuthorization;
    private final SupabaseAuthAdminClient supabaseAuthAdminClient;
    private final ProfileRepository profileRepository;
    private final RestaurantManagementService restaurantManagementService;
    private final PlatformRestaurantLifecycleService lifecycleService;
    private final String publicWebBaseUrl;

    @Autowired
    public PlatformRestaurantProvisioningService(
            PlatformAdminAuthorization platformAdminAuthorization,
            SupabaseAuthAdminClient supabaseAuthAdminClient,
            ProfileRepository profileRepository,
            RestaurantManagementService restaurantManagementService,
            PlatformRestaurantLifecycleService lifecycleService,
            @Value("${app.public-web-base-url:http://localhost:3000}") String publicWebBaseUrl) {
        this.platformAdminAuthorization = platformAdminAuthorization;
        this.supabaseAuthAdminClient = supabaseAuthAdminClient;
        this.profileRepository = profileRepository;
        this.restaurantManagementService = restaurantManagementService;
        this.lifecycleService = lifecycleService;
        this.publicWebBaseUrl = publicWebBaseUrl == null ? "" : publicWebBaseUrl.trim().replaceAll("/+$", "");
    }

    public PlatformRestaurantProvisioningService(
            PlatformAdminAuthorization authorization, SupabaseAuthAdminClient authAdminClient,
            ProfileRepository profiles, RestaurantManagementService restaurants, String publicWebBaseUrl) {
        this(authorization, authAdminClient, profiles, restaurants, null, publicWebBaseUrl);
    }

    @Transactional
    public PlatformRestaurantProvisionResponse provision(PlatformRestaurantProvisionRequest request) {
        platformAdminAuthorization.requirePlatformAdmin();
        if (request == null || request.restaurant() == null
                || request.ownerEmail() == null || request.ownerEmail().isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_PLATFORM_PROVISION_REQUEST",
                    "error.platform-admin.invalid-request");
        }
        // Validate all local input before an external invitation. Provider failure leaves no
        // restaurant or membership behind; restaurant and configuration writes are atomic.
        requireSafePublicOrigin();
        restaurantManagementService.validatePlatformProvisioningRequest(request.restaurant());
        if (request.restaurant().logoUrl() != null && !request.restaurant().logoUrl().isBlank()) {
            lifecycleService.validateLogoUrl(request.restaurant().logoUrl());
        }
        if (request.configuration() != null) lifecycleService.validateConfiguration(request.configuration());
        String email = request.ownerEmail().trim().toLowerCase(Locale.ROOT);
        boolean invitationSent = request.ownerUserId() == null;
        SupabaseAuthAdminClient.AuthUser identity;
        try {
            identity = invitationSent
                    ? supabaseAuthAdminClient.inviteByEmail(email, request.ownerFullName())
                    : supabaseAuthAdminClient.getUserById(request.ownerUserId());
        } catch (SupabaseAuthAdminException exception) {
            if (exception.isConfigurationError()) {
                throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                        "PLATFORM_OWNER_INVITATION_NOT_CONFIGURED", "error.member.invitation-not-configured");
            }
            if (exception.isAlreadyRegistered()) {
                // Retry with the exact Auth UUID after email verification. Never recover
                // ownership through mutable profile email/phone fields.
                throw new ApiException(HttpStatus.CONFLICT,
                        "PLATFORM_OWNER_EMAIL_ALREADY_REGISTERED", "error.platform-admin.owner-already-registered");
            }
            throw new ApiException(HttpStatus.BAD_GATEWAY,
                    "PLATFORM_OWNER_INVITATION_PROVIDER_ERROR", "error.member.invitation-provider-error");
        }
        if (identity == null || identity.id() == null || identity.email() == null
                || !email.equalsIgnoreCase(identity.email().trim())
                || (!invitationSent && !request.ownerUserId().equals(identity.id()))) {
            throw new ApiException(HttpStatus.BAD_GATEWAY,
                    "PLATFORM_OWNER_IDENTITY_MISMATCH", "error.member.invitation-provider-error");
        }
        if (!invitationSent && identity.emailConfirmedAt() == null) {
            throw new ApiException(HttpStatus.CONFLICT,
                    "PLATFORM_OWNER_EMAIL_NOT_VERIFIED", "error.platform-admin.owner-email-not-verified");
        }

        // Enrich only the exact profile belonging to the Auth UUID. The creation service
        // backfills a missing profile under that UUID in this database transaction.
        Profile profile = profileRepository.findById(identity.id()).orElse(null);
        if (profile != null && request.ownerFullName() != null && !request.ownerFullName().isBlank()
                && (profile.getFullName() == null || profile.getFullName().isBlank())) {
            profile.setFullName(request.ownerFullName().trim());
            profileRepository.save(profile);
        }
        RestaurantOnboardingResponse onboarding = restaurantManagementService
                .createRestaurantForPlatformAdmin(identity.id(), request.restaurant());
        if (request.configuration() != null) {
            lifecycleService.initializeConfiguration(onboarding.restaurant().id(), request.configuration());
        }
        String ownerWorkspaceUrl = UriComponentsBuilder.fromUriString(publicWebBaseUrl)
                .path("/workspace").queryParam("restaurantId", onboarding.restaurant().id())
                .build().encode().toUriString();
        // Keep legacy field names as null for compatibility, without returning QR credentials.
        // The owner generates/rotates QR codes in the authorized restaurant operations flow.
        return new PlatformRestaurantProvisionResponse(identity.id(), email, invitationSent,
                onboarding.initialRole(), onboarding.restaurant(), ownerWorkspaceUrl, null, null,
                identity.emailConfirmedAt() == null ? "INVITED" : "ACCEPTED", ownerWorkspaceUrl);
    }

    private void requireSafePublicOrigin() {
        try {
            URI origin = URI.create(publicWebBaseUrl);
            boolean localhost = "localhost".equalsIgnoreCase(origin.getHost())
                    || "127.0.0.1".equals(origin.getHost()) || "[::1]".equals(origin.getHost());
            if (origin.getHost() == null || origin.getUserInfo() != null || origin.getQuery() != null
                    || origin.getFragment() != null || (origin.getPath() != null && !origin.getPath().isEmpty())
                    || !("https".equalsIgnoreCase(origin.getScheme())
                    || (localhost && "http".equalsIgnoreCase(origin.getScheme())))) {
                throw new IllegalArgumentException("Unsafe public origin");
            }
        } catch (IllegalArgumentException exception) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "PLATFORM_PUBLIC_ORIGIN_NOT_CONFIGURED", "error.platform-admin.public-origin-not-configured");
        }
    }
}
