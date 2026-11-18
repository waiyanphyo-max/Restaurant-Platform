package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.platform.OwnerInvitationResponse;
import com.restaurant.platform.dto.platform.OwnerOnboardingResponse;
import com.restaurant.platform.repository.OwnerOnboardingRepository;
import com.restaurant.platform.repository.RestaurantMemberRepository;
import com.restaurant.platform.security.PlatformAdminAuthorization;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.security.RestaurantRole;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class OwnerOnboardingService {
    private static final Logger log = LoggerFactory.getLogger(OwnerOnboardingService.class);
    private final PlatformAdminAuthorization admins;
    private final RestaurantAuthorization authentication;
    private final RestaurantMemberRepository members;
    private final SupabaseAuthAdminClient authAdmin;
    private final OwnerOnboardingRepository state;
    private final Clock clock;

    @Autowired
    public OwnerOnboardingService(PlatformAdminAuthorization admins, RestaurantAuthorization authentication,
            RestaurantMemberRepository members, SupabaseAuthAdminClient authAdmin, OwnerOnboardingRepository state) {
        this(admins, authentication, members, authAdmin, state, Clock.systemUTC());
    }

    OwnerOnboardingService(PlatformAdminAuthorization admins, RestaurantAuthorization authentication,
            RestaurantMemberRepository members, SupabaseAuthAdminClient authAdmin,
            OwnerOnboardingRepository state, Clock clock) {
        this.admins = admins;
        this.authentication = authentication;
        this.members = members;
        this.authAdmin = authAdmin;
        this.state = state;
        this.clock = clock;
    }

    public OwnerInvitationResponse resend(UUID restaurantId, UUID ownerId) {
        UUID actor = admins.requirePlatformAdmin();
        members.findByRestaurantIdAndUserId(restaurantId, ownerId)
                .filter(member -> member.getRole() == RestaurantRole.OWNER)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "RESTAURANT_OWNER_NOT_FOUND",
                        "error.owner-onboarding.owner-not-found"));
        try {
            authAdmin.requireEmailDeliveryConfigured();
        } catch (SupabaseAuthAdminException exception) {
            throw providerError(exception);
        }
        var reservation = state.reserve(restaurantId, ownerId, actor);
        log.info("owner_invitation actor={} restaurant={} owner={} attempt={} outcome=RESERVED",
                actor, restaurantId, ownerId, reservation.id());
        try {
            var user = authAdmin.getUserById(ownerId);
            if (user == null || !ownerId.equals(user.id()) || user.email() == null || user.email().isBlank()) {
                throw new SupabaseAuthAdminException("Owner email identity is unavailable", false, false, null);
            }
            authAdmin.requestRecoveryEmail(user.email());
        } catch (SupabaseAuthAdminException exception) {
            String code = exception.isRateLimited() ? "PROVIDER_RATE_LIMITED" : "PROVIDER_ERROR";
            finish(reservation.id(), "FAILED", code);
            log.info("owner_invitation actor={} restaurant={} owner={} attempt={} outcome=FAILED code={}",
                    actor, restaurantId, ownerId, reservation.id(), code);
            throw providerError(exception);
        }
        finish(reservation.id(), "REQUESTED", null);
        log.info("owner_invitation actor={} restaurant={} owner={} attempt={} outcome=REQUESTED",
                actor, restaurantId, ownerId, reservation.id());
        return new OwnerInvitationResponse(restaurantId, ownerId, "UNKNOWN", "REQUESTED",
                reservation.requestedAt(), reservation.nextAllowedAt());
    }

    /** Only a fresh password sign-in from the validated JWT can establish the app-owned marker. */
    public OwnerOnboardingResponse complete() {
        UUID userId = authentication.requireAuthenticatedUserId();
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (!(auth instanceof JwtAuthenticationToken jwt) || !hasFreshPasswordProof(jwt)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "OWNER_PASSWORD_PROOF_REQUIRED",
                    "error.owner-onboarding.password-proof");
        }
        // The repository repeats this against locked authoritative rows, including account eligibility.
        if (members.findByUserId(userId).stream().noneMatch(member -> member.getRole() == RestaurantRole.OWNER)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "OWNER_MEMBERSHIP_REQUIRED",
                    "error.owner-onboarding.owner-required");
        }
        var completedAt = state.complete(userId);
        log.info("owner_onboarding owner={} outcome=COMPLETE", userId);
        return new OwnerOnboardingResponse("COMPLETE", completedAt);
    }

    private boolean hasFreshPasswordProof(JwtAuthenticationToken authentication) {
        Object amr = authentication.getToken().getClaims().get("amr");
        if (!(amr instanceof List<?> methods)) return false;
        long now = clock.instant().getEpochSecond();
        return methods.stream().anyMatch(entry -> entry instanceof Map<?, ?> method
                && "password".equals(method.get("method"))
                && method.get("timestamp") instanceof Number timestamp
                && Double.isFinite(timestamp.doubleValue())
                && timestamp.doubleValue() == timestamp.longValue()
                && timestamp.longValue() >= now - 300 && timestamp.longValue() <= now + 60);
    }

    private void finish(UUID attemptId, String outcome, String code) {
        try {
            state.finish(attemptId, outcome, code);
        } catch (ApiException exception) {
            // The committed RESERVED record still consumes rate limits. Never retry the provider here.
            log.warn("owner_invitation attempt={} outcome=AUDIT_FINALIZATION_UNAVAILABLE", attemptId);
        }
    }

    private ApiException providerError(SupabaseAuthAdminException exception) {
        if (exception.isConfigurationError()) {
            return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "OWNER_INVITATION_NOT_CONFIGURED",
                    "error.owner-onboarding.unavailable");
        }
        if (exception.isRateLimited()) {
            return new ApiException(HttpStatus.TOO_MANY_REQUESTS, "OWNER_INVITATION_RATE_LIMITED",
                    "error.owner-onboarding.rate-limited");
        }
        return new ApiException(HttpStatus.BAD_GATEWAY, "OWNER_INVITATION_PROVIDER_ERROR",
                "error.owner-onboarding.provider");
    }
}
