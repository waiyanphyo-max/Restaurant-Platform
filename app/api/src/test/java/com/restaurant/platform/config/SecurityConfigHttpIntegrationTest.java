package com.restaurant.platform.config;

import com.restaurant.platform.common.error.ApiSecurityErrorHandler;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * HTTP-level checks for the real security filter chain. These tests deliberately
 * avoid a database and a live Supabase project: requests without credentials must
 * be rejected before protected controllers/services are invoked.
 */
@WebMvcTest(
        controllers = SecurityConfigHttpIntegrationTest.ProbeController.class,
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

    @Test
    void protectedApiRejectsRequestsWithoutBearerToken() throws Exception {
        mockMvc.perform(get("/api/v1/protected-probe"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentTypeCompatibleWith("application/json"))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("UNAUTHORIZED")));
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

    @RestController
    static class ProbeController {

        @GetMapping("/api/v1/protected-probe")
        String protectedProbe() {
            return "protected";
        }

        @GetMapping("/api/v1/public/restaurants/{restaurantId}/menu")
        String publicMenu(@PathVariable UUID restaurantId) {
            return "public-menu";
        }
    }
}
