package com.restaurant.platform.config;

import com.restaurant.platform.common.error.ApiSecurityErrorHandler;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.mockito.Mockito.when;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * HTTP-level checks for the real security filter chain. These tests deliberately
 * avoid a database and a live Supabase project: requests without credentials must
 * be rejected before protected controllers/services are invoked.
 */
@WebMvcTest(
        controllers = SecurityTestProbeController.class,
        properties = {
                "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://auth.example.test/auth/v1",
                "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=https://auth.example.test/auth/v1/.well-known/jwks.json",
                "app.security.jwt.required-audience=authenticated",
                "app.security.jwt.signing-algorithm=ES256",
                "app.cors.allowed-origins=http://localhost:3000"
        })
@Import({SecurityConfig.class, ApiSecurityErrorHandler.class, LocaleConfig.class})
class SecurityConfigHttpIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private JwtDecoder jwtDecoder;

    @Test
    void protectedApiRejectsRequestsWithoutBearerToken() throws Exception {
        mockMvc.perform(get("/api/v1/protected-probe"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentTypeCompatibleWith("application/json"))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("UNAUTHORIZED")));
    }

    @Test
    void invalidBearerTokenReturnsJsonUnauthorizedResponse() throws Exception {
        when(jwtDecoder.decode("not-a-valid-token"))
                .thenThrow(new BadJwtException("Invalid test token"));

        mockMvc.perform(get("/api/v1/protected-probe")
                        .header("Authorization", "Bearer not-a-valid-token"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentTypeCompatibleWith("application/json"))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("UNAUTHORIZED")));
    }

    @Test
    void authenticatedUserWithoutRequiredAuthorityGetsForbiddenResponse() throws Exception {
        mockMvc.perform(get("/api/v1/manager-probe")
                        .with(SecurityMockMvcRequestPostProcessors.jwt()
                                .jwt(jwt -> jwt.subject(UUID.randomUUID().toString()))
                                .authorities()))
                .andExpect(status().isForbidden());
    }

    @Test
    void explicitlyWhitelistedPublicMenuRouteAllowsAnonymousRequests() throws Exception {
        mockMvc.perform(get("/api/v1/public/restaurants/{restaurantId}/menu",
                        UUID.randomUUID()))
                .andExpect(status().isOk())
                .andExpect(content().string("public-menu"));
    }

    @Test
    void unknownPublicRouteIsNotAutomaticallyPermitted() throws Exception {
        mockMvc.perform(get("/api/v1/public/restaurants/{restaurantId}/admin",
                        UUID.randomUUID()))
                .andExpect(status().isUnauthorized());
    }

}
