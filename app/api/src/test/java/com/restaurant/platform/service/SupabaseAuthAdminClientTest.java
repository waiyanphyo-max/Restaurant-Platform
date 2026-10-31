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
}
