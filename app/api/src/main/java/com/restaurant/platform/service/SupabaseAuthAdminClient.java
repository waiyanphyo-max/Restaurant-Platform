package com.restaurant.platform.service;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/** Server-only Supabase Auth Admin API client. Never expose its service-role key to browser/mobile code. */
@Component
public class SupabaseAuthAdminClient {
    private final RestClient restClient;
    private final String projectUrl;
    private final String serviceRoleKey;
    private final String inviteRedirectUrl;

    @Autowired
    public SupabaseAuthAdminClient(
            @Value("${app.supabase-admin.project-url:}") String projectUrl,
            @Value("${app.supabase-admin.service-role-key:}") String serviceRoleKey,
            @Value("${app.supabase-admin.invite-redirect-url:}") String inviteRedirectUrl) {
        this(createRestClient(), projectUrl, serviceRoleKey, inviteRedirectUrl);
    }

    SupabaseAuthAdminClient(RestClient restClient, String projectUrl, String serviceRoleKey, String inviteRedirectUrl) {
        this.restClient = restClient;
        this.projectUrl = projectUrl == null ? "" : projectUrl.trim().replaceAll("/+$", "");
        this.serviceRoleKey = serviceRoleKey == null ? "" : serviceRoleKey.trim();
        this.inviteRedirectUrl = inviteRedirectUrl == null ? "" : inviteRedirectUrl.trim();
    }

    private static RestClient createRestClient() {
        HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(http);
        factory.setReadTimeout(Duration.ofSeconds(15));
        return RestClient.builder().requestFactory(factory).build();
    }

    public AuthUser inviteByEmail(String email, String fullName) {
        requireConfigured();
        URI uri = buildInviteUri();
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("email", email);
        if (fullName != null && !fullName.isBlank()) {
            payload.put("data", Map.of("full_name", fullName.trim()));
        }
        try {
            AuthUser user = restClient.post()
                    .uri(uri)
                    .header("apikey", serviceRoleKey)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + serviceRoleKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(payload)
                    .retrieve()
                    .body(AuthUser.class);
            if (user == null || user.id() == null) {
                throw new SupabaseAuthAdminException(
                        "Supabase Auth returned no user ID", false, false, null);
            }
            return user;
        } catch (RestClientResponseException exception) {
            String body = exception.getResponseBodyAsString().toLowerCase(Locale.ROOT);
            boolean duplicate = (exception.getStatusCode().value() == 409
                    || exception.getStatusCode().value() == 422)
                    && (body.contains("already registered")
                    || body.contains("already exists")
                    || body.contains("already been registered"));
            if (duplicate) {
                throw new SupabaseAuthAdminException(
                        "The email address is already registered", false, true, exception);
            }
            throw new SupabaseAuthAdminException(
                    "Supabase Auth invitation request failed", false, false, exception);
        } catch (RestClientException exception) {
            throw new SupabaseAuthAdminException(
                    "Supabase Auth invitation request failed", false, false, exception);
        }
    }

    /** Resolve an exact Auth UUID. Profile contact fields are never an identity source. */
    public AuthUser getUserById(UUID userId) {
        requireConfigured();
        if (userId == null) {
            throw new SupabaseAuthAdminException("An Auth user ID is required", false, false, null);
        }
        try {
            AuthUser user = restClient.get()
                    .uri(URI.create(projectUrl + "/auth/v1/admin/users/" + userId))
                    .header("apikey", serviceRoleKey)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + serviceRoleKey)
                    .retrieve()
                    .body(AuthUser.class);
            if (user == null || !userId.equals(user.id())) {
                throw new SupabaseAuthAdminException("Supabase Auth returned an invalid identity", false, false, null);
            }
            return user;
        } catch (RestClientException exception) {
            throw new SupabaseAuthAdminException("Supabase Auth identity verification failed", false, false, exception);
        }
    }

    private URI buildInviteUri() {
        UriComponentsBuilder builder = UriComponentsBuilder
                .fromUriString(projectUrl + "/auth/v1/invite");
        if (!inviteRedirectUrl.isBlank()) {
            builder.queryParam("redirect_to", inviteRedirectUrl);
        }
        return builder.build().encode().toUri();
    }

    private void requireConfigured() {
        if (projectUrl.isBlank() || serviceRoleKey.isBlank()) {
            throw new SupabaseAuthAdminException(
                    "Supabase Auth Admin is not configured", true, false, null);
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record AuthUser(
            UUID id,
            String email,
            @JsonProperty("email_confirmed_at") OffsetDateTime emailConfirmedAt,
            @JsonProperty("invited_at") OffsetDateTime invitedAt,
            @JsonProperty("last_sign_in_at") OffsetDateTime lastSignInAt,
            String phone,
            @JsonProperty("phone_confirmed_at") OffsetDateTime phoneConfirmedAt) {
        public AuthUser(UUID id, String email) {
            this(id, email, null, null, null, null, null);
        }
    }
}
