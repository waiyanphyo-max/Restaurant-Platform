package com.restaurant.platform.controller;

import com.restaurant.platform.common.error.ApiSecurityErrorHandler;
import com.restaurant.platform.config.LocaleConfig;
import com.restaurant.platform.config.SecurityConfig;
import com.restaurant.platform.entity.Restaurant;
import com.restaurant.platform.entity.RestaurantMember;
import com.restaurant.platform.repository.DeliveryRepository;
import com.restaurant.platform.repository.ProfileRepository;
import com.restaurant.platform.repository.RestaurantMemberRepository;
import com.restaurant.platform.repository.RestaurantRepository;
import com.restaurant.platform.repository.RestaurantSettingsRepository;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.security.RestaurantRole;
import com.restaurant.platform.service.RestaurantLogoService;
import com.restaurant.platform.service.RestaurantManagementService;
import com.restaurant.platform.service.SupabaseStorageClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Real JWT/membership checks and controllers; only persistence and Storage are mocked. */
@WebMvcTest(controllers = {RestaurantManagementController.class, RestaurantLogoController.class}, properties = {
        "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://auth.example.test/auth/v1",
        "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=https://auth.example.test/auth/v1/.well-known/jwks.json"
})
@Import({SecurityConfig.class, ApiSecurityErrorHandler.class, LocaleConfig.class,
        RestaurantAuthorization.class, RestaurantManagementService.class, RestaurantLogoService.class})
class RestaurantProfileLogoHttpTest {
    private static final UUID TENANT = UUID.fromString("00000000-0000-4000-8000-000000000001");
    private static final UUID OTHER_TENANT = UUID.fromString("00000000-0000-4000-8000-000000000002");
    private static final UUID ACTOR = UUID.fromString("00000000-0000-4000-8000-000000000003");
    private static final String LOGO = "https://media.example.test/public/restaurant-logos/" + TENANT + "/logo?v=current";

    @Autowired private MockMvc mvc;
    @MockitoBean private JwtDecoder decoder;
    @MockitoBean private RestaurantRepository restaurants;
    @MockitoBean private RestaurantMemberRepository memberships;
    @MockitoBean private RestaurantSettingsRepository settings;
    @MockitoBean private ProfileRepository profiles;
    @MockitoBean private DeliveryRepository deliveries;
    @MockitoBean private SupabaseStorageClient storage;
    private Restaurant restaurant;

    @BeforeEach
    void setUp() {
        Restaurant fixture = new Restaurant();
        fixture.setId(TENANT);
        fixture.setName("Existing restaurant");
        fixture.setSlug("existing-restaurant");
        fixture.setTownship("Existing township");
        fixture.setCity("Existing city");
        fixture.setLogoUrl(LOGO);
        restaurant = spy(fixture);
        when(restaurants.findByIdAndIsActiveTrue(TENANT)).thenReturn(Optional.of(restaurant));
        when(restaurants.save(any(Restaurant.class))).thenAnswer(invocation -> invocation.getArgument(0));
    }

    @ParameterizedTest
    @EnumSource(value = RestaurantRole.class, names = {"OWNER", "MANAGER"})
    void profileAcceptsUnchangedLogoResendsWithoutAssigningIt(RestaurantRole role) throws Exception {
        membership(role);
        mvc.perform(put(profilePath(TENANT)).with(jwt().jwt(token -> token.subject(ACTOR.toString())))
                        .contentType(MediaType.APPLICATION_JSON).content(profileJson(",\"logoUrl\":\"" + LOGO + "\"")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Updated restaurant"))
                .andExpect(jsonPath("$.logoUrl").value(LOGO));
        verify(restaurant, never()).setLogoUrl(any());
        verify(restaurants).save(restaurant);
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"null"})
    void omittedOrNullLogoPreservesExistingLogo(String value) throws Exception {
        membership(RestaurantRole.MANAGER);
        mvc.perform(put(profilePath(TENANT)).with(jwt().jwt(token -> token.subject(ACTOR.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(profileJson(value == null ? "" : ",\"logoUrl\":" + value)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.logoUrl").value(LOGO));
        verify(restaurant, never()).setLogoUrl(any());
    }

    @ParameterizedTest
    @EnumSource(value = RestaurantRole.class, names = {"OWNER", "MANAGER"})
    void profileCannotInjectAnotherLogoEvenWithSettingsPermission(RestaurantRole role) throws Exception {
        membership(role);
        mvc.perform(put(profilePath(TENANT)).with(jwt().jwt(token -> token.subject(ACTOR.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(profileJson(",\"logoUrl\":\"https://unapproved.example.test/logo.png\"")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("RESTAURANT_LOGO_UPLOAD_REQUIRED"));
        assertEquals("Existing restaurant", restaurant.getName());
        assertEquals(LOGO, restaurant.getLogoUrl());
        verify(restaurants, never()).save(any());
    }

    @Test
    void blankLogoCannotClearPersistedLogo() throws Exception {
        membership(RestaurantRole.MANAGER);
        mvc.perform(put(profilePath(TENANT)).with(jwt().jwt(token -> token.subject(ACTOR.toString())))
                        .contentType(MediaType.APPLICATION_JSON).content(profileJson(",\"logoUrl\":\" \"")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("RESTAURANT_LOGO_UPLOAD_REQUIRED"));
        verify(restaurants, never()).save(any());
    }

    @ParameterizedTest
    @EnumSource(value = RestaurantRole.class, names = {"STAFF", "DELIVERY_DRIVER"})
    void staffAndDriverCannotUpdateProfiles(RestaurantRole role) throws Exception {
        membership(role);
        mvc.perform(put(profilePath(TENANT)).with(jwt().jwt(token -> token.subject(ACTOR.toString())))
                        .contentType(MediaType.APPLICATION_JSON).content(profileJson("")))
                .andExpect(status().isForbidden());
        verify(restaurants, never()).findByIdAndIsActiveTrue(any());
        verify(restaurants, never()).save(any());
    }

    @Test
    void unauthenticatedCannotUpdateProfileOrUploadLogo() throws Exception {
        mvc.perform(put(profilePath(TENANT)).contentType(MediaType.APPLICATION_JSON).content(profileJson("")))
                .andExpect(status().isUnauthorized());
        mvc.perform(multipart(logoPath(TENANT)).file(png())).andExpect(status().isUnauthorized());
        verifyNoInteractions(memberships, storage);
        verify(restaurants, never()).save(any());
    }

    @Test
    void ownerMembershipInOneTenantCannotAuthorizeAnother() throws Exception {
        membership(RestaurantRole.OWNER);
        mvc.perform(put(profilePath(OTHER_TENANT)).with(jwt().jwt(token -> token.subject(ACTOR.toString())))
                        .header("X-Restaurant-Id", TENANT).param("actorUserId", ACTOR.toString())
                        .contentType(MediaType.APPLICATION_JSON).content(profileJson("")))
                .andExpect(status().isForbidden());
        mvc.perform(multipart(logoPath(OTHER_TENANT)).file(png())
                        .with(jwt().jwt(token -> token.subject(ACTOR.toString()))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("RESTAURANT_LOGO_OWNER_REQUIRED"));
        verifyNoInteractions(storage);
        verify(restaurants, never()).findByIdAndIsActiveTrue(any());
    }

    @Test
    void clientSuppliedOwnerIdentityCannotAuthorizeAnotherSubject() throws Exception {
        membership(RestaurantRole.OWNER);
        UUID outsider = UUID.fromString("00000000-0000-4000-8000-000000000004");
        mvc.perform(put(profilePath(TENANT)).with(jwt().jwt(token -> token.subject(outsider.toString())))
                        .header("X-User-Id", ACTOR).param("actorUserId", ACTOR.toString())
                        .contentType(MediaType.APPLICATION_JSON).content(profileJson("")))
                .andExpect(status().isForbidden());
        mvc.perform(multipart(logoPath(TENANT)).file(png())
                        .with(jwt().jwt(token -> token.subject(outsider.toString())))
                        .param("actorUserId", ACTOR.toString()))
                .andExpect(status().isForbidden());
        verifyNoInteractions(storage);
        verify(restaurants, never()).save(any());
    }

    @Test
    void ownerCanStillUploadThroughSpring() throws Exception {
        membership(RestaurantRole.OWNER);
        when(storage.uploadRestaurantLogo(eq(TENANT), eq("image/png"), any(byte[].class))).thenReturn(LOGO);
        when(restaurants.updateActiveRestaurantLogo(TENANT, LOGO)).thenReturn(1);
        mvc.perform(multipart(logoPath(TENANT)).file(png())
                        .with(jwt().jwt(token -> token.subject(ACTOR.toString()))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.restaurantId").value(TENANT.toString()))
                .andExpect(jsonPath("$.logoUrl").value(LOGO));
        verify(restaurants).updateActiveRestaurantLogo(TENANT, LOGO);
    }

    @ParameterizedTest
    @EnumSource(value = RestaurantRole.class, names = {"MANAGER", "STAFF", "DELIVERY_DRIVER"})
    void uploadRemainsOwnerOnly(RestaurantRole role) throws Exception {
        membership(role);
        mvc.perform(multipart(logoPath(TENANT)).file(png())
                        .with(jwt().jwt(token -> token.subject(ACTOR.toString()))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("RESTAURANT_LOGO_OWNER_REQUIRED"));
        verifyNoInteractions(storage);
        verify(restaurants, never()).updateActiveRestaurantLogo(any(), any());
    }

    private void membership(RestaurantRole role) {
        RestaurantMember member = new RestaurantMember();
        member.setRestaurantId(TENANT);
        member.setUserId(ACTOR);
        member.setRole(role);
        when(memberships.findByRestaurantIdAndUserId(TENANT, ACTOR)).thenReturn(Optional.of(member));
    }

    private static String profileJson(String logoField) {
        return "{\"name\":\"Updated restaurant\",\"township\":\"Township\",\"city\":\"City\"" + logoField + "}";
    }

    private static String profilePath(UUID tenant) { return "/api/v1/restaurants/" + tenant + "/profile"; }
    private static String logoPath(UUID tenant) { return "/api/v1/restaurants/" + tenant + "/logo"; }
    private static MockMultipartFile png() {
        return new MockMultipartFile("file", "logo.png", "image/png",
                new byte[] {(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A});
    }
}
