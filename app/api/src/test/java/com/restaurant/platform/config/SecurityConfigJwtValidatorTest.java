package com.restaurant.platform.config;

import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtValidators;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

class SecurityConfigJwtValidatorTest {

    private static final String ISSUER = "https://auth.example.test/auth/v1";

    @Test
    void acceptsUuidSubjectFromSupabaseUserToken() {
        Jwt jwt = jwt(UUID.randomUUID().toString(), List.of("authenticated"), ISSUER,
                Instant.now().minusSeconds(1), Instant.now().plusSeconds(60));

        OAuth2TokenValidatorResult result = SecurityConfig.userSubjectValidator().validate(jwt);

        assertTrue(result.getErrors().isEmpty());
    }

    @Test
    void rejectsNonUuidSubject() {
        Jwt jwt = jwt("not-a-user-uuid", List.of("authenticated"), ISSUER,
                Instant.now().minusSeconds(1), Instant.now().plusSeconds(60));

        OAuth2TokenValidatorResult result = SecurityConfig.userSubjectValidator().validate(jwt);

        assertFalse(result.getErrors().isEmpty());
        assertEquals("invalid_token", result.getErrors().iterator().next().getErrorCode());
    }

    @Test
    void rejectsMissingSubject() {
        Jwt jwt = jwt(null, List.of("authenticated"), ISSUER,
                Instant.now().minusSeconds(1), Instant.now().plusSeconds(60));

        OAuth2TokenValidatorResult result = SecurityConfig.userSubjectValidator().validate(jwt);

        assertFalse(result.getErrors().isEmpty());
    }

    @Test
    void acceptsRequiredAudience() {
        OAuth2TokenValidatorResult result = SecurityConfig
                .audienceValidator("authenticated")
                .validate(jwt(UUID.randomUUID().toString(),
                        List.of("authenticated", "another-audience"), ISSUER,
                        Instant.now().minusSeconds(1), Instant.now().plusSeconds(60)));

        assertTrue(result.getErrors().isEmpty());
    }

    @Test
    void rejectsMissingOrIncorrectAudience() {
        OAuth2TokenValidatorResult result = SecurityConfig
                .audienceValidator("authenticated")
                .validate(jwt(UUID.randomUUID().toString(), List.of("other"), ISSUER,
                        Instant.now().minusSeconds(1), Instant.now().plusSeconds(60)));

        assertFalse(result.getErrors().isEmpty());
    }

    @Test
    void defaultJwtValidatorsRejectIncorrectIssuer() {
        Jwt token = jwt(UUID.randomUUID().toString(), List.of("authenticated"),
                "https://wrong.example.test/auth/v1",
                Instant.now().minusSeconds(1), Instant.now().plusSeconds(60));

        OAuth2TokenValidatorResult result = JwtValidators
                .createDefaultWithIssuer(ISSUER)
                .validate(token);

        assertFalse(result.getErrors().isEmpty());
    }

    @Test
    void defaultJwtValidatorsRejectExpiredTokens() {
        Instant now = Instant.now();
        Jwt token = jwt(UUID.randomUUID().toString(), List.of("authenticated"), ISSUER,
                now.minusSeconds(300), now.minusSeconds(120));

        OAuth2TokenValidatorResult result = JwtValidators
                .createDefaultWithIssuer(ISSUER)
                .validate(token);

        assertFalse(result.getErrors().isEmpty());
    }

    private static Jwt jwt(
            String subject,
            List<String> audience,
            String issuer,
            Instant issuedAt,
            Instant expiresAt) {
        Jwt.Builder builder = Jwt.withTokenValue("validator-test-token")
                .header("alg", "ES256")
                .issuedAt(issuedAt)
                .expiresAt(expiresAt)
                .claim("aud", audience)
                .claim("iss", issuer);
        if (subject != null) {
            builder.claim("sub", subject);
        }
        return builder.build();
    }
}
