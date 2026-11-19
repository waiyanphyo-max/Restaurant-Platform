package com.restaurant.platform.controller;

import com.restaurant.platform.common.error.ApiSecurityErrorHandler;
import com.restaurant.platform.common.error.GlobalExceptionHandler;
import com.restaurant.platform.config.ExactNumberConfiguration;
import com.restaurant.platform.config.LocaleConfig;
import com.restaurant.platform.config.SecurityConfig;
import com.restaurant.platform.entity.Restaurant;
import com.restaurant.platform.entity.RestaurantMember;
import com.restaurant.platform.entity.RestaurantRuntimeBranding;
import com.restaurant.platform.repository.DeliveryRepository;
import com.restaurant.platform.repository.RestaurantMemberRepository;
import com.restaurant.platform.repository.RestaurantRepository;
import com.restaurant.platform.repository.RestaurantRuntimeBrandingRepository;
import com.restaurant.platform.security.PlatformAdminAuthorization;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.security.RestaurantRole;
import com.restaurant.platform.service.RestaurantBrandingService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import static org.hamcrest.Matchers.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** HTTP, real service and real JWT/membership authorization; no provider or hosted access. */
@WebMvcTest(controllers = RestaurantBrandingController.class, properties = {
        "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://auth.example.test/auth/v1",
        "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=https://auth.example.test/auth/v1/.well-known/jwks.json",
        "app.security.platform-admin-user-ids=00000000-0000-0000-0000-000000000003"
})
@Import({SecurityConfig.class, ApiSecurityErrorHandler.class, GlobalExceptionHandler.class, LocaleConfig.class,
        ExactNumberConfiguration.class, RestaurantBrandingService.class, RestaurantAuthorization.class,
        PlatformAdminAuthorization.class})
class RestaurantBrandingHttpTest {
    private static final UUID A = UUID.fromString("00000000-0000-0000-0000-000000000010");
    private static final UUID B = UUID.fromString("00000000-0000-0000-0000-000000000020");
    private static final UUID USER = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final String ADMIN = "00000000-0000-0000-0000-000000000003";
    private static final String PALETTE = "{\"primaryColor\":\"#a51d22\",\"secondaryColor\":\"#c99632\",\"backgroundColor\":\"#fff8f0\"}";
    private static final String REQUEST = "{\"expectedRevision\":0,\"palette\":" + PALETTE + "}";
    private static final String PUBLIC = "/api/v1/public/restaurants/";
    private static final String MEMBER = "/api/v1/restaurants/";
    private static final String PLATFORM = "/api/v1/platform/restaurants/";

    @Autowired private MockMvc mvc;
    @MockitoBean private RestaurantRepository restaurants;
    @MockitoBean private RestaurantRuntimeBrandingRepository branding;
    @MockitoBean private RestaurantMemberRepository members;
    @MockitoBean private DeliveryRepository deliveries;
    private final Map<UUID, RestaurantRuntimeBranding> rows = new ConcurrentHashMap<>();
    private Restaurant restaurantA;

    @BeforeEach
    void setup() {
        rows.clear();
        restaurantA = restaurant(A, "Red restaurant");
        Restaurant restaurantB = restaurant(B, "Blue restaurant");
        for (Restaurant restaurant : new Restaurant[]{restaurantA, restaurantB}) {
            when(restaurants.findByIdAndIsActiveTrue(restaurant.getId())).thenReturn(Optional.of(restaurant));
            when(restaurants.findActiveForBrandingUpdate(restaurant.getId())).thenReturn(Optional.of(restaurant));
        }
        when(branding.findById(any())).thenAnswer(call -> Optional.ofNullable(rows.get(call.getArgument(0))));
        when(branding.saveAndFlush(any())).thenAnswer(call -> {
            RestaurantRuntimeBranding row = call.getArgument(0);
            rows.put(row.getRestaurantId(), row);
            return row;
        });
    }

    @ParameterizedTest
    @EnumSource(value = RestaurantRole.class, names = {"OWNER", "MANAGER"})
    void ownerAndManagerCanSaveAndRefreshOnlyTheirTenant(RestaurantRole role) throws Exception {
        member(A, role);
        mvc.perform(put(MEMBER + A + "/branding").with(jwt().jwt(t -> t.subject(USER.toString())))
                        .contentType(MediaType.APPLICATION_JSON).content(REQUEST))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.palette.primaryColor").value("#A51D22"))
                .andExpect(jsonPath("$.revision").value(1));
        mvc.perform(get(PUBLIC + A + "/branding"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.revision").value(1))
                .andExpect(jsonPath("$.palette.secondaryColor").value("#C99632"));
        mvc.perform(get(PUBLIC + B + "/branding"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.restaurantId").value(B.toString()))
                .andExpect(jsonPath("$.palette").value(nullValue())).andExpect(jsonPath("$.revision").value(0));
        mvc.perform(put(MEMBER + B + "/branding").with(jwt().jwt(t -> t.subject(USER.toString())
                                .claim("role", "OWNER").claim("restaurantId", B.toString())))
                        .header("X-Restaurant-Id", A).contentType(MediaType.APPLICATION_JSON).content(REQUEST))
                .andExpect(status().isForbidden());
        verify(restaurants, never()).findActiveForBrandingUpdate(B);
    }

    @ParameterizedTest
    @EnumSource(value = RestaurantRole.class, names = {"STAFF", "DELIVERY_DRIVER"})
    void staffAndDriverCannotWrite(RestaurantRole role) throws Exception {
        member(A, role);
        mvc.perform(put(MEMBER + A + "/branding").with(jwt().jwt(t -> t.subject(USER.toString())))
                        .contentType(MediaType.APPLICATION_JSON).content(REQUEST))
                .andExpect(status().isForbidden());
        verifyNoInteractions(branding);
        verify(restaurants, never()).findActiveForBrandingUpdate(any());
    }

    @Test
    void anonymousWritesAndUnreviewedMethodsAreDenied() throws Exception {
        mvc.perform(put(MEMBER + A + "/branding").contentType(MediaType.APPLICATION_JSON).content(REQUEST))
                .andExpect(status().isUnauthorized());
        mvc.perform(post(PLATFORM + A + "/branding").contentType(MediaType.APPLICATION_JSON).content(REQUEST))
                .andExpect(status().isUnauthorized());
        mvc.perform(put(PUBLIC + A + "/branding").contentType(MediaType.APPLICATION_JSON).content(REQUEST))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(branding, restaurants);
    }

    @Test
    void publicDtoExposesOnlyPublicIdentityAndPaletteAndNeverUsesForeignRow() throws Exception {
        rows.put(A, row(A, "#A51D22", "#C99632", "#FFF8F0", 7));
        rows.put(B, row(B, "#184F91", "#111827", "#07111F", 3));
        mvc.perform(get(PUBLIC + A + "/branding").header("If-None-Match", "\"7\""))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(header().doesNotExist("ETag"))
                .andExpect(jsonPath("$", aMapWithSize(5)))
                .andExpect(jsonPath("$.palette", aMapWithSize(3)))
                .andExpect(jsonPath("$.restaurantId").value(A.toString()))
                .andExpect(jsonPath("$.displayName").value("Red restaurant"))
                .andExpect(jsonPath("$.logoUrl").value("https://cdn.example.test/" + A + "/logo?v=" + A))
                .andExpect(content().string(not(containsString("private"))));
        mvc.perform(get(PUBLIC + B + "/branding"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.palette.primaryColor").value("#184F91"))
                .andExpect(jsonPath("$.revision").value(3));
        verifyNoInteractions(members, deliveries);
    }

    @Test
    void staleWriterAndRepeatedAdminInitializationCannotReplaceCurrentPalette() throws Exception {
        member(A, RestaurantRole.OWNER);
        rows.put(A, row(A, "#184F91", "#111827", "#07111F", 2));
        mvc.perform(put(MEMBER + A + "/branding").with(jwt().jwt(t -> t.subject(USER.toString())))
                        .contentType(MediaType.APPLICATION_JSON).content(REQUEST))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("RESTAURANT_BRANDING_STALE"))
                .andExpect(header().string("Cache-Control", "no-store"));
        mvc.perform(post(PLATFORM + A + "/branding").with(jwt().jwt(t -> t.subject(ADMIN)))
                        .contentType(MediaType.APPLICATION_JSON).content(REQUEST.replace("\":0", "\":2")))
                .andExpect(status().isConflict());
        mvc.perform(get(PUBLIC + A + "/branding"))
                .andExpect(jsonPath("$.palette.primaryColor").value("#184F91"))
                .andExpect(jsonPath("$.revision").value(2));
        verify(branding, never()).saveAndFlush(any());
    }

    @Test
    void allowlistedAdminCanOnlyInitializeSameAuthorityOnceWithoutMembership() throws Exception {
        mvc.perform(post(PLATFORM + A + "/branding").with(jwt().jwt(t -> t.subject(USER.toString())
                                .claim("role", "platform_admin")))
                        .contentType(MediaType.APPLICATION_JSON).content(REQUEST))
                .andExpect(status().isForbidden());
        mvc.perform(post(PLATFORM + B + "/branding").with(jwt().jwt(t -> t.subject(ADMIN)))
                        .contentType(MediaType.APPLICATION_JSON).content(REQUEST))
                .andExpect(status().isOk()).andExpect(jsonPath("$.restaurantId").value(B.toString()))
                .andExpect(jsonPath("$.revision").value(1));
        mvc.perform(get(PUBLIC + B + "/branding"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.palette.primaryColor").value("#A51D22"));
        mvc.perform(post(PLATFORM + B + "/branding").with(jwt().jwt(t -> t.subject(ADMIN)))
                        .contentType(MediaType.APPLICATION_JSON).content(REQUEST))
                .andExpect(status().isConflict());
        verifyNoInteractions(members);
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "{\"expectedRevision\":0}", "{\"expectedRevision\":null,\"palette\":{}}",
            "{\"expectedRevision\":-1,\"palette\":{}}", "{\"expectedRevision\":0.5,\"palette\":{}}",
            "{\"expectedRevision\":9007199254740992,\"palette\":{}}"})
    void missingInvalidAndFractionalValuesAreRejected(String input) throws Exception {
        member(A, RestaurantRole.MANAGER);
        badRequest(input);
    }

    @Test
    void invalidColorsAndLogoTenantOrActorInjectionAreRejected() throws Exception {
        member(A, RestaurantRole.MANAGER);
        for (String color : new String[]{"red", "#abc", "#12345678", "#GG1122", " #123456", "#123456\n"}) {
            badRequest(REQUEST.replace("#a51d22", color.replace("\n", "\\n")));
        }
        badRequest(REQUEST.replace("\"#fff8f0\"", "null"));
        for (String field : new String[]{"logoUrl", "restaurantId", "actorUserId", "primaryColor"}) {
            badRequest(REQUEST.substring(0, REQUEST.length() - 1) + ",\"" + field + "\":\"injected\"}");
        }
        badRequest(REQUEST.replace("#a51d22\"", "#a51d22\",\"logoUrl\":\"https://evil.test/logo\""));
        verify(branding, never()).saveAndFlush(any());
    }

    @Test
    void invalidStoredPresentationAndMissingInactiveRestaurantFailSafely() throws Exception {
        rows.put(A, row(A, "bad", "#C99632", "#FFF8F0", 8));
        restaurantA.setLogoUrl("javascript:private-secret");
        mvc.perform(get(PUBLIC + A + "/branding"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.palette").value(nullValue()))
                .andExpect(jsonPath("$.logoUrl").value(nullValue())).andExpect(jsonPath("$.revision").value(8));
        when(restaurants.findByIdAndIsActiveTrue(B)).thenReturn(Optional.empty());
        mvc.perform(get(PUBLIC + B + "/branding"))
                .andExpect(status().isNotFound()).andExpect(header().string("Cache-Control", "no-store"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"https://images.test/logo?token=private", "https://images.test/logo?v=ok&token=private",
            "https://user:private@images.test/logo", "https://images.test/logo#private", "http://images.test/logo"})
    void publicLogoProjectionNeverExposesLegacyCredentials(String logo) throws Exception {
        restaurantA.setLogoUrl(logo);
        mvc.perform(get(PUBLIC + A + "/branding"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.logoUrl").value(nullValue()))
                .andExpect(content().string(not(containsString("private"))));
    }

    private void badRequest(String input) throws Exception {
        mvc.perform(put(MEMBER + A + "/branding").with(jwt().jwt(t -> t.subject(USER.toString())))
                        .contentType(MediaType.APPLICATION_JSON).content(input))
                .andExpect(status().isBadRequest()).andExpect(header().string("Cache-Control", "no-store"));
    }

    private void member(UUID id, RestaurantRole role) {
        RestaurantMember member = new RestaurantMember();
        member.setRestaurantId(id); member.setUserId(USER); member.setRole(role);
        when(members.findByRestaurantIdAndUserId(id, USER)).thenReturn(Optional.of(member));
    }

    private static Restaurant restaurant(UUID id, String name) {
        Restaurant restaurant = new Restaurant();
        restaurant.setId(id); restaurant.setName(name); restaurant.setIsActive(true);
        restaurant.setPhone("private-contact"); restaurant.setAddress("private-address");
        restaurant.setLogoUrl("https://cdn.example.test/" + id + "/logo?v=" + id);
        return restaurant;
    }

    private static RestaurantRuntimeBranding row(UUID id, String primary, String secondary, String background, long revision) {
        RestaurantRuntimeBranding row = new RestaurantRuntimeBranding();
        row.setRestaurantId(id); row.setPrimaryColor(primary); row.setSecondaryColor(secondary);
        row.setBackgroundColor(background); row.setRevision(revision);
        return row;
    }
}
