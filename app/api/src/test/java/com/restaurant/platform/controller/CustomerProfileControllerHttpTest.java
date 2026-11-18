package com.restaurant.platform.controller;

import com.restaurant.platform.common.error.ApiSecurityErrorHandler;
import com.restaurant.platform.config.LocaleConfig;
import com.restaurant.platform.config.SecurityConfig;
import com.restaurant.platform.entity.Profile;
import com.restaurant.platform.repository.DeliveryRepository;
import com.restaurant.platform.repository.ProfileRepository;
import com.restaurant.platform.repository.RestaurantMemberRepository;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.service.CustomerProfileService;
import com.restaurant.platform.service.SupabaseMediaStorageClient;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Optional;
import java.util.UUID;

import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(controllers = CustomerProfileController.class, properties = {
        "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://auth.example.test/auth/v1",
        "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=https://auth.example.test/auth/v1/.well-known/jwks.json"
})
@Import({SecurityConfig.class, ApiSecurityErrorHandler.class, LocaleConfig.class,
        RestaurantAuthorization.class, CustomerProfileService.class})
class CustomerProfileControllerHttpTest {
    private static final String BASE = "/api/v1/customer/profile";
    @Autowired private MockMvc mvc;
    @MockitoBean private JwtDecoder decoder;
    @MockitoBean private ProfileRepository profiles;
    @MockitoBean private RestaurantMemberRepository memberships;
    @MockitoBean private DeliveryRepository deliveries;
    @MockitoBean private SupabaseMediaStorageClient media;

    @Test
    void anonymousCustomerCannotReadOrRestoreAProfile() throws Exception {
        mvc.perform(get(BASE)).andExpect(status().isUnauthorized());
        verifyNoInteractions(profiles);
    }

    @Test
    void profileUsesOnlyAuthenticatedSubjectAndDisablesCaching() throws Exception {
        UUID owner = UUID.randomUUID(), other = UUID.randomUUID();
        Profile profile = new Profile();
        profile.setId(owner);
        profile.setFullName("Saved name");
        when(profiles.findById(owner)).thenReturn(Optional.of(profile));

        mvc.perform(get(BASE).with(jwt().jwt(token -> token.subject(owner.toString())).authorities())
                        .param("userId", other.toString()).header("X-Restaurant-Id", UUID.randomUUID().toString()))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andExpect(jsonPath("$.id").value(owner.toString()))
                .andExpect(jsonPath("$.fullName").value("Saved name"));
        verify(profiles).findById(owner);
        verify(profiles, never()).findById(other);
        verifyNoInteractions(memberships, deliveries);
    }

    @Test
    void missingAuthRegistryUserStaysMissingWithUsefulSafeCode() throws Exception {
        UUID owner = UUID.randomUUID();
        when(profiles.findById(owner)).thenReturn(Optional.empty());
        mvc.perform(get(BASE).with(jwt().jwt(token -> token.subject(owner.toString()))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("CUSTOMER_PROFILE_NOT_FOUND"));
        verify(profiles).restoreMissingFromAuthUser(owner);
    }
}
