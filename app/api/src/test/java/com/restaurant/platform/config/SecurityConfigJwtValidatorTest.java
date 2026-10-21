package com.restaurant.platform.config;

import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

class SecurityConfigJwtValidatorTest {

    @Test
    void acceptsUuidSubjectFromSupabaseUserToken() {
        Jwt jwt = jwt(UUID.randomUUID().toString(), List.of("authenticated"));

        OAuth2TokenValidatorResult result = SecurityConfig.userSubjectValidator().validate(jwt);

        assertTrue(result.getErrors().isEmpty());
    }

    @Test
    void rejectsNonUuidSubject() {
        Jwt jwt = jwt("not-a-user-uuid", List.of("authenticated"));

        OAuth2TokenValidatorResult result = SecurityConfig.userSubjectValidator().validate(jwt);

        assertFalse(result.getErrors().isEmpty());
        assertEquals("invalid_token", result.getErrors().iterator().next().getErrorCode());
    }

    @Test
    void rejectsMissingSubject() {
        Jwt jwt = jwt(null, List.of("authenticated"));

        OAuth2TokenValidatorResult result = SecurityConfig.userSubjectValidator().validate(jwt);

        assertFalse(result.getErrors().isEmpty());
    }

    @Test
    void acceptsRequiredAudience() {
        OAuth2TokenValidatorResult result = SecurityConfig
                .audienceValidator("authenticated")
                .validate(jwt(UUID.randomUUID().toString(), List.of("authenticated", "another-audience")));

        assertTrue(result.getErrors().isEmpty());
    }

    @Test
    void rejectsMissingOrIncorrectAudience() {
        OAuth2TokenValidatorResult result = SecurityConfig
                .audienceValidator("authenticated")
                .validate(jwt(UUID.randomUUID().toString(), List.of("other")));

        assertFalse(result.getErrors().isEmpty());
    }

    private static Jwt jwt(String subject, List<String> audience) {
        Instant now = Instant.now();
        Jwt.Builder builder = Jwt.withTokenValue("validator-test-token")
                .header("alg", "ES256")
                .issuedAt(now.minusSeconds(1))
                .expiresAt(now.plusSeconds(60))
                .claim("aud", audience);
        if (subject != null) {
            builder.claim("sub", subject);
        }
        return builder.build();
    }
}
