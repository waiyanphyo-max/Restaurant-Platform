package com.restaurant.platform.controller;

import com.restaurant.platform.common.error.*;
import com.restaurant.platform.config.*;
import com.restaurant.platform.entity.*;
import com.restaurant.platform.repository.*;
import com.restaurant.platform.security.*;
import com.restaurant.platform.service.*;
import com.restaurant.platform.dto.menu.CategoryResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import java.util.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Real HTTP/JWT allowlist and service wiring, using disposable repository fixtures only. */
@WebMvcTest(controllers = {PlatformRestaurantBootstrapController.class, CatalogImageController.class}, properties = {
        "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://auth.example.test/auth/v1",
        "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=https://auth.example.test/auth/v1/.well-known/jwks.json",
        "app.security.platform-admin-user-ids=00000000-0000-0000-0000-000000000003"
})
@Import({SecurityConfig.class, ApiSecurityErrorHandler.class, GlobalExceptionHandler.class, LocaleConfig.class,
        ExactNumberConfiguration.class, PlatformRestaurantBootstrapService.class, RestaurantAuthorization.class,
        CatalogImageService.class, ImageUploadValidator.class,
        PlatformRestaurantBootstrapHttpTest.TestBeans.class})
class PlatformRestaurantBootstrapHttpTest {
    @TestConfiguration
    static class TestBeans {
        @Bean
        PlatformAdminAuthorization platformAdminAuthorization(RestaurantAuthorization auth,
                @Value("${app.security.platform-admin-user-ids:}") String allowlist) {
            return new PlatformAdminAuthorization(auth, allowlist);
        }
    }
    static final String ADMIN = "00000000-0000-0000-0000-000000000003";
    static final UUID A = UUID.fromString("00000000-0000-0000-0000-000000000010");
    static final UUID USER = UUID.fromString("00000000-0000-0000-0000-000000000001");
    static final String URL = "/api/v1/platform/restaurants/"+A+"/bootstrap";
    static final String CATEGORY = "{\"operationKey\":\"category.food\",\"kind\":\"CATEGORY\",\"category\":{\"name\":\"Food\",\"displayOrder\":0,\"active\":true}}";
    @Autowired MockMvc mvc;
    @Autowired PlatformAdminAuthorization platformAuthorization;
    @MockitoBean RestaurantRepository restaurants;
    @MockitoBean RestaurantSettingsRepository settings;
    @MockitoBean RestaurantBootstrapStepRepository steps;
    @MockitoBean RestaurantMemberRepository members;
    @MockitoBean DeliveryRepository deliveries;
    @MockitoBean OrderRepository orders;
    @MockitoBean CatalogManagementService catalog;
    @MockitoBean PlatformRestaurantLifecycleService lifecycle;
    @MockitoBean RestaurantBrandingService branding;
    @MockitoBean RestaurantSettingsService ordering;
    @MockitoBean ProductRepository products;
    @MockitoBean ProductVariantRepository variants;
    @MockitoBean SupabaseMediaStorageClient storage;

    @BeforeEach void setup() {
        ReflectionTestUtils.setField(platformAuthorization,"configuredPlatformAdminIds",ADMIN);
        var restaurant = new Restaurant(); restaurant.setId(A); restaurant.setIsActive(true);
        when(restaurants.findActiveForBrandingUpdate(A)).thenReturn(Optional.of(restaurant));
        var setting = new RestaurantSettings(); setting.setRestaurantId(A);
        when(settings.findById(A)).thenReturn(Optional.of(setting));
        when(steps.saveAndFlush(any())).thenAnswer(call -> call.getArgument(0));
    }

    @Test void anonymousCannotReadOrWrite() throws Exception {
        mvc.perform(get(URL)).andExpect(status().isUnauthorized());
        mvc.perform(post(URL+"/steps").contentType(MediaType.APPLICATION_JSON).content(CATEGORY))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(restaurants,settings,steps,catalog,lifecycle);
    }

    @ParameterizedTest @EnumSource(RestaurantRole.class)
    void membershipAndForgedRoleCannotGrantPlatformBootstrap(RestaurantRole role) throws Exception {
        var member = new RestaurantMember(); member.setUserId(USER); member.setRestaurantId(A); member.setRole(role);
        when(members.findByRestaurantIdAndUserId(A,USER)).thenReturn(Optional.of(member));
        mvc.perform(post(URL+"/steps").with(jwt().jwt(t -> t.subject(USER.toString())
                        .claim("role","platform_admin").claim("restaurantId",A.toString())))
                        .header("X-Platform-Admin","true").contentType(MediaType.APPLICATION_JSON).content(CATEGORY))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("PLATFORM_ADMIN_REQUIRED"));
        mvc.perform(get(URL).with(jwt().jwt(t -> t.subject(USER.toString()))))
                .andExpect(status().isForbidden());
        verifyNoInteractions(restaurants,settings,steps,catalog,lifecycle);
    }

    @ParameterizedTest @ValueSource(strings={"", "not-a-uuid", "00000000-0000-0000-0000-00000000000"})
    void absentOrMalformedServerAllowlistFailsClosed(String allowlist) throws Exception {
        ReflectionTestUtils.setField(platformAuthorization,"configuredPlatformAdminIds",allowlist);
        mvc.perform(post(URL+"/steps").with(jwt().jwt(t -> t.subject(ADMIN)))
                        .contentType(MediaType.APPLICATION_JSON).content(CATEGORY))
                .andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.code").value("PLATFORM_ADMIN_NOT_CONFIGURED"));
        verifyNoInteractions(restaurants,settings,steps,catalog,lifecycle);
    }

    @Test void invalidJwtSubjectIsRejectedBeforeAnyTenantRead() throws Exception {
        mvc.perform(get(URL).with(jwt().jwt(t -> t.subject("claimed-email@example.test"))))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(restaurants,steps,lifecycle);
    }

    @Test void allowlistedAdminReachesInitialDomainValidationWithoutMembership() throws Exception {
        mvc.perform(post(URL+"/steps").with(jwt().jwt(t -> t.subject(ADMIN)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"operationKey\":\"review\",\"kind\":\"COMPLETE_CATALOG\"}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("BOOTSTRAP_CATALOG_EMPTY"));
        verify(restaurants).findActiveForBrandingUpdate(A);
        verifyNoInteractions(members,deliveries);
        verify(steps,never()).saveAndFlush(any());
    }

    @Test void adminCanReviewOnlySupportedOperationsAndCannotClaimActorOrUpload() throws Exception {
        for(String body : List.of(
                CATEGORY.substring(0,CATEGORY.length()-1)+",\"actorId\":\""+USER+"\"}",
                CATEGORY.substring(0,CATEGORY.length()-1)+",\"restaurantId\":\""+A+"\"}",
                "{\"operationKey\":\"upload\",\"kind\":\"UPLOAD_IMAGE\"}",
                "{\"operationKey\":\"media\",\"kind\":\"MEDIA_MANIFEST\",\"mediaManifest\":[null]}")) {
            mvc.perform(post(URL+"/steps").with(jwt().jwt(t -> t.subject(ADMIN)))
                            .contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_BOOTSTRAP_STEP"));
        }
        // Allowlisting does not grant ordinary tenant media permission or touch Storage.
        var image = new MockMultipartFile("file", "approved.jpg", "image/jpeg", new byte[]{1,2,3});
        mvc.perform(multipart("/api/v1/restaurants/"+A+"/products/"+A+"/image").file(image)
                        .with(jwt().jwt(t -> t.subject(ADMIN))))
                .andExpect(status().isForbidden());
        mvc.perform(multipart("/api/v1/restaurants/"+A+"/products/"+A+"/variants/"+A+"/image").file(image)
                        .with(jwt().jwt(t -> t.subject(ADMIN))))
                .andExpect(status().isForbidden());
        verifyNoInteractions(storage, products, variants);
        verifyNoInteractions(catalog);
        verify(steps,never()).saveAndFlush(any());
    }

    @ParameterizedTest @ValueSource(strings={"1.5", "\"1000\"", "9007199254740992"})
    void exactWholeCurrencyContractCannotBeCoerced(String price) throws Exception {
        String body = "{\"operationKey\":\"product\",\"kind\":\"PRODUCT\",\"currency\":\"MMK\",\"product\":{\"categoryId\":\""+A+"\",\"name\":\"Tea\",\"price\":"+price+",\"trackStock\":false,\"available\":true}}";
        mvc.perform(post(URL+"/steps").with(jwt().jwt(t -> t.subject(ADMIN)))
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_BOOTSTRAP_STEP"));
        verifyNoInteractions(catalog);
        verify(steps,never()).saveAndFlush(any());
    }
}
