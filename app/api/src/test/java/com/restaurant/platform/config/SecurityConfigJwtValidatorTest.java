package com.restaurant.platform.config;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.ECDSASigner;
import com.nimbusds.jose.jwk.Curve;
import com.nimbusds.jose.jwk.ECKey;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.gen.ECKeyGenerator;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtValidationException;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;

import java.time.Instant;
import java.util.Date;
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
    void rejectsAbbreviatedUuidSubject() {
        Jwt token = jwt("1-1-1-1-1", List.of("authenticated"), ISSUER,
                Instant.now().minusSeconds(1), Instant.now().plusSeconds(60));

        assertTrue(SecurityConfig.userSubjectValidator().validate(token).hasErrors());
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
    void tokenValidatorRejectsIncorrectIssuer() {
        Jwt token = jwt(UUID.randomUUID().toString(), List.of("authenticated"),
                "https://wrong.example.test/auth/v1",
                Instant.now().minusSeconds(1), Instant.now().plusSeconds(60));

        OAuth2TokenValidatorResult result = SecurityConfig
                .tokenValidator(ISSUER, "authenticated")
                .validate(token);

        assertFalse(result.getErrors().isEmpty());
    }

    @Test
    void tokenValidatorRejectsExpiredTokens() {
        Instant now = Instant.now();
        Jwt token = jwt(UUID.randomUUID().toString(), List.of("authenticated"), ISSUER,
                now.minusSeconds(300), now.minusSeconds(120));

        OAuth2TokenValidatorResult result = SecurityConfig
                .tokenValidator(ISSUER, "authenticated")
                .validate(token);

        assertFalse(result.getErrors().isEmpty());
    }

    @Test
    void nimbusRejectsWrongSignatureAndSignedTokensWithoutAnExpiry() throws Exception {
        ECKey trustedKey = new ECKeyGenerator(Curve.P_256).keyID("test-key").generate();
        ECKey unrelatedKey = new ECKeyGenerator(Curve.P_256).keyID(trustedKey.getKeyID()).generate();
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSource(
                        new ImmutableJWKSet<>(new JWKSet(trustedKey.toPublicJWK())))
                .jwsAlgorithm(SignatureAlgorithm.ES256)
                .build();
        decoder.setJwtValidator(SecurityConfig.tokenValidator(ISSUER, "authenticated"));

        String subject = UUID.randomUUID().toString();
        Instant now = Instant.now();
        JWTClaimsSet.Builder claims = new JWTClaimsSet.Builder()
                .issuer(ISSUER)
                .audience("authenticated")
                .subject(subject)
                .issueTime(Date.from(now.minusSeconds(1)));
        JWTClaimsSet noExpiry = claims.build();
        JWTClaimsSet withExpiry = claims.expirationTime(Date.from(now.plusSeconds(120))).build();

        assertEquals(subject, decoder.decode(sign(trustedKey, withExpiry)).getSubject());
        assertThrows(BadJwtException.class, () -> decoder.decode(sign(unrelatedKey, withExpiry)));
        assertThrows(JwtValidationException.class, () -> decoder.decode(sign(trustedKey, noExpiry)));
    }

    private static String sign(ECKey key, JWTClaimsSet claims) throws Exception {
        SignedJWT token = new SignedJWT(
                new JWSHeader.Builder(JWSAlgorithm.ES256).keyID(key.getKeyID()).build(), claims);
        token.sign(new ECDSASigner(key));
        return token.serialize();
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
