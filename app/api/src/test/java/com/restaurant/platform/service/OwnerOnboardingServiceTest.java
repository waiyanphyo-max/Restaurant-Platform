package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.entity.RestaurantMember;
import com.restaurant.platform.repository.OwnerOnboardingRepository;
import com.restaurant.platform.repository.RestaurantMemberRepository;
import com.restaurant.platform.security.PlatformAdminAuthorization;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.security.RestaurantRole;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class OwnerOnboardingServiceTest {
    private final UUID restaurant = UUID.randomUUID(), owner = UUID.randomUUID(), actor = UUID.randomUUID();
    private final Instant now = Instant.parse("2026-11-12T12:00:00Z");
    private PlatformAdminAuthorization admins;
    private RestaurantAuthorization authentication;
    private RestaurantMemberRepository members;
    private SupabaseAuthAdminClient provider;
    private OwnerOnboardingRepository state;
    private OwnerOnboardingService service;
    private OwnerOnboardingRepository.Reservation reservation;

    @BeforeEach
    void setup() {
        admins = mock(PlatformAdminAuthorization.class);
        authentication = mock(RestaurantAuthorization.class);
        members = mock(RestaurantMemberRepository.class);
        provider = mock(SupabaseAuthAdminClient.class);
        state = mock(OwnerOnboardingRepository.class);
        service = new OwnerOnboardingService(admins, authentication, members, provider, state,
                Clock.fixed(now, ZoneOffset.UTC));
        when(admins.requirePlatformAdmin()).thenReturn(actor);
        when(authentication.requireAuthenticatedUserId()).thenReturn(owner);
        RestaurantMember member = new RestaurantMember();
        member.setRestaurantId(restaurant);
        member.setUserId(owner);
        member.setRole(RestaurantRole.OWNER);
        when(members.findByRestaurantIdAndUserId(restaurant, owner)).thenReturn(Optional.of(member));
        when(members.findByUserId(owner)).thenReturn(List.of(member));
        reservation = new OwnerOnboardingRepository.Reservation(UUID.randomUUID(),
                OffsetDateTime.ofInstant(now, ZoneOffset.UTC), OffsetDateTime.ofInstant(now.plusSeconds(60), ZoneOffset.UTC));
        when(state.reserve(restaurant, owner, actor)).thenReturn(reservation);
        when(provider.getUserById(owner)).thenReturn(new SupabaseAuthAdminClient.AuthUser(owner, "registered@example.test"));
    }

    @AfterEach
    void clearSecurity() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void existingOwnerGetsRecoveryAtAuthoritativeEmailWithNoIdentityOrMembershipMutation() {
        var result = service.resend(restaurant, owner);
        assertEquals("UNKNOWN", result.onboardingStatus());
        assertEquals("REQUESTED", result.emailStatus());
        assertEquals(reservation.nextAllowedAt(), result.nextAllowedAt());
        var order = inOrder(state, provider);
        order.verify(provider).requireEmailDeliveryConfigured();
        order.verify(state).reserve(restaurant, owner, actor);
        order.verify(provider).getUserById(owner);
        order.verify(provider).requestRecoveryEmail("registered@example.test");
        order.verify(state).finish(reservation.id(), "REQUESTED", null);
        verify(provider, never()).inviteByEmail(any(), any());
        verify(members, never()).save(any());
        assertFalse(result.toString().contains("registered@example.test"));
    }

    @Test
    void unauthorizedAdminAndCrossRestaurantOwnersNeverReachEmailProvider() {
        when(admins.requirePlatformAdmin()).thenThrow(new ApiException(HttpStatus.FORBIDDEN,
                "PLATFORM_ADMIN_REQUIRED", "error.platform-admin.required"));
        assertEquals("PLATFORM_ADMIN_REQUIRED", assertThrows(ApiException.class,
                () -> service.resend(restaurant, owner)).getCode());
        verifyNoInteractions(provider, state, members);
        reset(admins);
        when(admins.requirePlatformAdmin()).thenReturn(actor);
        assertEquals("RESTAURANT_OWNER_NOT_FOUND", assertThrows(ApiException.class,
                () -> service.resend(UUID.randomUUID(), owner)).getCode());
        verifyNoInteractions(provider, state);
    }

    @Test
    void knownCompletionAndDurableRateLimitPreventAnotherEmail() {
        when(state.reserve(restaurant, owner, actor)).thenThrow(new ApiException(HttpStatus.CONFLICT,
                "OWNER_ONBOARDING_COMPLETE", "error.owner-onboarding.complete"));
        assertEquals("OWNER_ONBOARDING_COMPLETE", assertThrows(ApiException.class,
                () -> service.resend(restaurant, owner)).getCode());
        doThrow(new ApiException(HttpStatus.TOO_MANY_REQUESTS,
                "OWNER_INVITATION_RATE_LIMITED", "error.owner-onboarding.rate-limited"))
                .when(state).reserve(restaurant, owner, actor);
        assertEquals("OWNER_INVITATION_RATE_LIMITED", assertThrows(ApiException.class,
                () -> service.resend(restaurant, owner)).getCode());
        verify(provider, never()).getUserById(any());
        verify(provider, never()).requestRecoveryEmail(any());
    }

    @Test
    void providerFailureConsumesReservedAttemptAndReturnsSanitizedFailure() {
        doThrow(new SupabaseAuthAdminException("private provider details", false, false, null))
                .when(provider).requestRecoveryEmail(any());
        var error = assertThrows(ApiException.class, () -> service.resend(restaurant, owner));
        assertEquals("OWNER_INVITATION_PROVIDER_ERROR", error.getCode());
        assertFalse(error.getMessage().contains("private"));
        verify(state).finish(reservation.id(), "FAILED", "PROVIDER_ERROR");
        verify(state, never()).finish(reservation.id(), "REQUESTED", null);
    }

    @Test
    void providerRateLimitAndMissingConfigurationAreActionableWithoutFalseSuccess() {
        doThrow(new SupabaseAuthAdminException("rate", false, false, true, null))
                .when(provider).requestRecoveryEmail(any());
        assertEquals(HttpStatus.TOO_MANY_REQUESTS, assertThrows(ApiException.class,
                () -> service.resend(restaurant, owner)).getStatus());
        verify(state).finish(reservation.id(), "FAILED", "PROVIDER_RATE_LIMITED");
        reset(state);
        doThrow(new SupabaseAuthAdminException("config", true, false, null))
                .when(provider).requireEmailDeliveryConfigured();
        assertEquals("OWNER_INVITATION_NOT_CONFIGURED", assertThrows(ApiException.class,
                () -> service.resend(restaurant, owner)).getCode());
        verifyNoInteractions(state);
    }

    @Test
    void mismatchedProviderUuidCannotRedirectEmailToAnotherAccount() {
        when(provider.getUserById(owner)).thenReturn(new SupabaseAuthAdminClient.AuthUser(UUID.randomUUID(), "other@example.test"));
        assertThrows(ApiException.class, () -> service.resend(restaurant, owner));
        verify(provider, never()).requestRecoveryEmail(any());
        verify(state).finish(reservation.id(), "FAILED", "PROVIDER_ERROR");
    }

    @Test
    void freshSignedPasswordProofForExistingOwnerCreatesCompletionMarker() {
        token(List.of(Map.of("method", "password", "timestamp", now.minusSeconds(5).getEpochSecond())));
        var completed = OffsetDateTime.ofInstant(now, ZoneOffset.UTC);
        when(state.complete(owner)).thenReturn(completed);
        var result = service.complete();
        assertEquals("COMPLETE", result.onboardingStatus());
        assertEquals(completed, result.completedAt());
        verify(state).complete(owner);
        verifyNoInteractions(provider);
        verify(members, never()).save(any());
    }

    @Test
    void recoveryInviteMagicLinkStaleAndClientMetadataAreNotPasswordProof() {
        for (Object amr : List.of(List.of(Map.of("method", "recovery", "timestamp", now.getEpochSecond())),
                List.of(Map.of("method", "invite", "timestamp", now.getEpochSecond())),
                List.of(Map.of("method", "otp", "timestamp", now.getEpochSecond())),
                List.of(Map.of("method", "password", "timestamp", now.minusSeconds(301).getEpochSecond())),
                List.of(Map.of("method", "password", "timestamp", now.plusSeconds(61).getEpochSecond())),
                List.of(Map.of("method", "password", "timestamp", "12345")), "password", List.of())) {
            token(amr);
            assertEquals("OWNER_PASSWORD_PROOF_REQUIRED", assertThrows(ApiException.class, service::complete).getCode());
        }
        verifyNoInteractions(state);
    }

    @Test
    void passwordProofWithoutAuthoritativeOwnerMembershipIsForbidden() {
        token(List.of(Map.of("method", "password", "timestamp", now.getEpochSecond())));
        when(members.findByUserId(owner)).thenReturn(List.of());
        assertEquals("OWNER_MEMBERSHIP_REQUIRED", assertThrows(ApiException.class, service::complete).getCode());
        verifyNoInteractions(state);
    }

    private void token(Object amr) {
        Jwt jwt = Jwt.withTokenValue("test-signed-by-security-filter")
                .header("alg", "ES256").subject(owner.toString()).claim("amr", amr)
                .claim("user_metadata", Map.of("role", "OWNER", "onboarding_complete", true)).build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt));
    }
}
