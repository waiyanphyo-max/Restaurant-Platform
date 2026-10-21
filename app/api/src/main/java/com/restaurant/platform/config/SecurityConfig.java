package com.restaurant.platform.config;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import com.restaurant.platform.common.error.ApiSecurityErrorHandler;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * Security configuration for the Restaurant Platform REST API.
 * Supabase Auth issues access tokens; this API validates their signature,
 * issuer, timestamps, audience, and UUID subject. Restaurant permissions are
 * resolved from server-side membership records, not JWT role claims.
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    private final ApiSecurityErrorHandler apiSecurityErrorHandler;

    @Value("${app.cors.allowed-origins:http://localhost:3000,http://localhost:8081}")
    private String allowedOriginsProperty;

    @Value("${spring.security.oauth2.resourceserver.jwt.issuer-uri}")
    private String issuerUri;

    @Value("${spring.security.oauth2.resourceserver.jwt.jwk-set-uri}")
    private String jwkSetUri;

    @Value("${app.security.jwt.required-audience:authenticated}")
    private String requiredAudience;

    @Value("${app.security.jwt.signing-algorithm:ES256}")
    private String jwtSigningAlgorithm;

    public SecurityConfig(ApiSecurityErrorHandler apiSecurityErrorHandler) {
        this.apiSecurityErrorHandler = apiSecurityErrorHandler;
    }

    @Bean
    public JwtDecoder jwtDecoder() {
        final SignatureAlgorithm signingAlgorithm;
        try {
            signingAlgorithm = SignatureAlgorithm.valueOf(
                    jwtSigningAlgorithm.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException exception) {
            throw new IllegalStateException(
                    "Unsupported Supabase JWT signing algorithm configured: " + jwtSigningAlgorithm,
                    exception);
        }

        NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSetUri(jwkSetUri)
                .jwsAlgorithm(signingAlgorithm)
                .build();

        OAuth2TokenValidator<Jwt> issuerValidator =
                JwtValidators.createDefaultWithIssuer(issuerUri);

        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                issuerValidator,
                audienceValidator(requiredAudience),
                userSubjectValidator()));
        return decoder;
    }

    /**
     * Supabase Auth user IDs are UUIDs. Reject tokens whose subject cannot be
     * mapped unambiguously to a profile ID before they reach application services.
     */
    static OAuth2TokenValidator<Jwt> userSubjectValidator() {
        return jwt -> {
            try {
                UUID.fromString(jwt.getSubject());
                return OAuth2TokenValidatorResult.success();
            } catch (IllegalArgumentException | NullPointerException exception) {
                return OAuth2TokenValidatorResult.failure(new OAuth2Error(
                        "invalid_token",
                        "The token subject must be a valid user UUID",
                        null));
            }
        };
    }

    static OAuth2TokenValidator<Jwt> audienceValidator(String requiredAudience) {
        return jwt -> {
            if (requiredAudience != null
                    && !requiredAudience.isBlank()
                    && jwt.getAudience() != null
                    && jwt.getAudience().contains(requiredAudience)) {
                return OAuth2TokenValidatorResult.success();
            }
            return OAuth2TokenValidatorResult.failure(new OAuth2Error(
                    "invalid_token",
                    "The required token audience is missing",
                    null));
        };
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .cors(Customizer.withDefaults())
                .csrf(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session
                        .sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint(apiSecurityErrorHandler)
                        .accessDeniedHandler(apiSecurityErrorHandler))
                .authorizeHttpRequests(authorize -> authorize
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers("/actuator/health", "/actuator/health/**").permitAll()
                        .requestMatchers("/error").permitAll()
                        // Whitelist only the public routes that currently exist. New endpoints
                        // remain authenticated unless explicitly reviewed and added here.
                        .requestMatchers(HttpMethod.GET,
                                "/api/v1/public/restaurants/*/menu",
                                "/api/v1/public/restaurants/*/products/*/modifier-groups").permitAll()
                        .requestMatchers(HttpMethod.POST,
                                "/api/v1/public/restaurants/*/orders/common-qr",
                                "/api/v1/public/restaurants/*/orders/table-qr").permitAll()
                        // These endpoints use the unguessable X-Queue-Token issued at QR checkout.
                        .requestMatchers(HttpMethod.GET,
                                "/api/v1/public/queue-tickets/*/status",
                                "/api/v1/public/queue-tickets/*/notifications").permitAll()
                        .requestMatchers(HttpMethod.PATCH,
                                "/api/v1/public/queue-tickets/*/notifications/*/read").permitAll()
                        .anyRequest().authenticated())
                .oauth2ResourceServer(oauth2 -> oauth2
                        // Also use the localized handler for invalid/missing bearer tokens.
                        .authenticationEntryPoint(apiSecurityErrorHandler)
                        .accessDeniedHandler(apiSecurityErrorHandler)
                        .jwt(Customizer.withDefaults()));

        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        List<String> allowedOrigins = Arrays.stream(allowedOriginsProperty.split(","))
                .map(String::trim)
                .filter(origin -> !origin.isBlank())
                .toList();

        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(allowedOrigins);
        configuration.setAllowedMethods(
                List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of(
                "Authorization",
                "Content-Type",
                "Accept",
                "Origin",
                "X-Queue-Token",
                "Accept-Language"));
        configuration.setExposedHeaders(List.of("Location"));
        configuration.setAllowCredentials(false);
        configuration.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}
