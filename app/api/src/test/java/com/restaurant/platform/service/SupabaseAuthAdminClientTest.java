package com.restaurant.platform.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.time.OffsetDateTime;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class SupabaseAuthAdminClientTest {
    private MockRestServiceServer server;
    private SupabaseAuthAdminClient client;
    private final UUID userId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        client = new SupabaseAuthAdminClient(builder.build(), "https://project.supabase.co", "server-only-test-key",
                "https://guest.example/auth/accept-invite");
    }

    @Test
    void resolvesIdentityByExactAuthUuidWithServerOnlyCredentials() {
        server.expect(requestTo("https://project.supabase.co/auth/v1/admin/users/" + userId))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("apikey", "server-only-test-key"))
                .andExpect(header("Authorization", "Bearer server-only-test-key"))
                .andRespond(withSuccess("""
                        {"id":"%s","email":"owner@example.com","email_confirmed_at":"2026-10-30T09:00:00Z",
                         "invited_at":"2026-10-29T09:00:00Z","last_sign_in_at":"2026-10-30T10:00:00Z",
                         "phone":"+959111111111","phone_confirmed_at":null}
                        """.formatted(userId), MediaType.APPLICATION_JSON));

        var user = client.getUserById(userId);

        assertEquals(userId, user.id());
        assertEquals(OffsetDateTime.parse("2026-10-30T09:00:00Z"), user.emailConfirmedAt());
        assertEquals(OffsetDateTime.parse("2026-10-29T09:00:00Z"), user.invitedAt());
        assertEquals(OffsetDateTime.parse("2026-10-30T10:00:00Z"), user.lastSignInAt());
        assertNull(user.phoneConfirmedAt());
        server.verify();
    }

    @Test
    void sendsInvitationToProviderAndReturnsProviderUuid() {
        server.expect(requestTo("https://project.supabase.co/auth/v1/invite?redirect_to=https://guest.example/auth/accept-invite"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().json("{\"email\":\"owner@example.com\",\"data\":{\"full_name\":\"Owner\"}}"))
                .andRespond(withSuccess("{\"id\":\"" + userId + "\",\"email\":\"owner@example.com\"}", MediaType.APPLICATION_JSON));

        assertEquals(userId, client.inviteByEmail("owner@example.com", "Owner").id());
        server.verify();
    }

    @Test
    void mismatchedIdentityIsRejected() {
        server.expect(anything()).andRespond(withSuccess("{\"id\":\"" + UUID.randomUUID() + "\",\"email\":\"owner@example.com\"}", MediaType.APPLICATION_JSON));
        assertThrows(SupabaseAuthAdminException.class, () -> client.getUserById(userId));
        server.verify();
    }

    @Test
    void unavailableProviderIsSanitizedAndNotTreatedAsDuplicate() {
        server.expect(anything()).andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE)
                .body("private provider detail").contentType(MediaType.TEXT_PLAIN));
        var failure = assertThrows(SupabaseAuthAdminException.class, () -> client.getUserById(userId));
        assertFalse(failure.getMessage().contains("private provider detail"));
        assertFalse(failure.isAlreadyRegistered());
        server.verify();
    }

    @Test
    void registeredEmailIsReportedWithoutReturningOrGuessingAnotherIdentity() {
        server.expect(anything()).andRespond(withStatus(HttpStatus.UNPROCESSABLE_ENTITY)
                .body("{\"msg\":\"User already registered\"}").contentType(MediaType.APPLICATION_JSON));
        assertTrue(assertThrows(SupabaseAuthAdminException.class,
                () -> client.inviteByEmail("owner@example.com", null)).isAlreadyRegistered());
        server.verify();
    }

    @Test
    void missingServiceRoleConfigurationFailsClosed() {
        var unconfigured = new SupabaseAuthAdminClient(RestClient.create(), "", "", "");
        assertTrue(assertThrows(SupabaseAuthAdminException.class,
                () -> unconfigured.getUserById(userId)).isConfigurationError());
        assertTrue(assertThrows(SupabaseAuthAdminException.class,
                () -> unconfigured.inviteByEmail("owner@example.com", null)).isConfigurationError());
    }

    @Test
    void existingAccountEmailUsesRecoveryAndSameHttpsRedirectWithoutGeneratingRawLinks() {
        server.expect(requestTo("https://project.supabase.co/auth/v1/recover?redirect_to=https://guest.example/auth/accept-invite"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("apikey", "server-only-test-key"))
                .andExpect(header("Authorization", "Bearer server-only-test-key"))
                .andExpect(content().json("{\"email\":\"owner@example.com\"}"))
                .andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));
        client.requestRecoveryEmail("owner@example.com");
        server.verify();
    }

    @Test
    void emailRequiresExplicitHttpsAcceptanceUrlBeforeProviderRequest() {
        for (String redirect : java.util.List.of("", "http://localhost:3000/auth/accept-invite",
                "https://localhost/auth/accept-invite", "https://guest.example/wrong",
                "https://user@guest.example/auth/accept-invite", "https://guest.example/auth/accept-invite?next=https://evil.test",
                "https://guest.example/auth/accept-invite#token", "not a url")) {
            var invalid = new SupabaseAuthAdminClient(RestClient.create(), "https://project.supabase.co", "key", redirect);
            assertTrue(assertThrows(SupabaseAuthAdminException.class,
                    () -> invalid.inviteByEmail("owner@example.com", null)).isConfigurationError());
            assertTrue(assertThrows(SupabaseAuthAdminException.class,
                    () -> invalid.requestRecoveryEmail("owner@example.com")).isConfigurationError());
        }
    }

    @Test
    void providerOriginCannotSendPrivilegedCredentialsOverHttp() {
        var invalid = new SupabaseAuthAdminClient(RestClient.create(), "http://project.supabase.co", "key",
                "https://guest.example/auth/accept-invite");
        assertTrue(assertThrows(SupabaseAuthAdminException.class,
                () -> invalid.getUserById(userId)).isConfigurationError());
    }

    @Test
    void explicitLocalOptInResolvesExactUuidAgainstLoopbackProviderOnly() {
        RestClient.Builder builder = RestClient.builder();
        var localServer = MockRestServiceServer.bindTo(builder).build();
        var local = new SupabaseAuthAdminClient(builder.build(), "http://127.0.0.1:54321", "local-server-key",
                "", true);
        localServer.expect(requestTo("http://127.0.0.1:54321/auth/v1/admin/users/" + userId))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("apikey", "local-server-key"))
                .andExpect(header("Authorization", "Bearer local-server-key"))
                .andRespond(withSuccess("{\"id\":\"" + userId + "\",\"email\":\"owner@example.test\"}",
                        MediaType.APPLICATION_JSON));

        assertEquals(userId, local.getUserById(userId).id());
        localServer.verify();
    }

    @Test
    void loopbackRequiresExplicitOptInAndNeverAllowsEmailSideEffects() {
        var disabled = new SupabaseAuthAdminClient(RestClient.create(), "http://127.0.0.1:54321", "local-key", "");
        assertTrue(assertThrows(SupabaseAuthAdminException.class,
                () -> disabled.getUserById(userId)).isConfigurationError());

        // Even a production-shaped redirect must not enable email through the lookup-only local exception.
        var lookupOnly = new SupabaseAuthAdminClient(RestClient.create(), "http://127.0.0.1:54321", "local-key",
                "https://guest.example/auth/accept-invite", true);
        assertTrue(assertThrows(SupabaseAuthAdminException.class,
                () -> lookupOnly.inviteByEmail("owner@example.test", "Owner")).isConfigurationError());
        assertTrue(assertThrows(SupabaseAuthAdminException.class,
                () -> lookupOnly.requestRecoveryEmail("owner@example.test")).isConfigurationError());
    }

    @Test
    void localOptInRejectsRemoteAliasesAndAmbiguousOriginsBeforeSendingCredentials() {
        for (String origin : java.util.List.of("http://project.supabase.co:54321", "http://192.168.1.10:54321",
                "http://localhost:54321", "http://127.0.0.2:54321", "http://127.1:54321",
                "http://[::ffff:127.0.0.1]:54321", "http://127.0.0.1", "http://127.0.0.1:0",
                "http://127.0.0.1:65536", "http://user@127.0.0.1:54321", "http://127.0.0.1:54321/other",
                "http://127.0.0.1:54321?secret=value", "http://127.0.0.1:54321#fragment")) {
            var invalid = new SupabaseAuthAdminClient(RestClient.create(), origin, "local-key", "", true);
            assertTrue(assertThrows(SupabaseAuthAdminException.class,
                    () -> invalid.getUserById(userId)).isConfigurationError(), origin);
        }
    }

    @Test
    void recoveryProviderErrorAndRateLimitDoNotReportSuccess() {
        server.expect(anything()).andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS)
                .body("private email/token details"));
        var failure = assertThrows(SupabaseAuthAdminException.class,
                () -> client.requestRecoveryEmail("owner@example.com"));
        assertTrue(failure.isRateLimited());
        assertFalse(failure.getMessage().contains("private"));
        server.verify();
    }
}
