package com.restaurant.platform.controller;

import com.restaurant.platform.common.error.*;
import com.restaurant.platform.config.*;
import com.restaurant.platform.entity.*;
import com.restaurant.platform.repository.*;
import com.restaurant.platform.security.*;
import com.restaurant.platform.service.*;
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
import java.util.*;
import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Actual HTTP, JWT membership, editorial service and unchanged menu orderability projection. */
@WebMvcTest(controllers = {FeaturedProductController.class, PublicMenuController.class}, properties = {
        "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://auth.example.test/auth/v1",
        "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=https://auth.example.test/auth/v1/.well-known/jwks.json"})
@Import({SecurityConfig.class, ApiSecurityErrorHandler.class, GlobalExceptionHandler.class, LocaleConfig.class,
        ExactNumberConfiguration.class, FeaturedProductService.class, PublicMenuService.class,
        RestaurantAuthorization.class})
class FeaturedProductHttpTest {
    private static final UUID A = UUID.randomUUID(), B = UUID.randomUUID(), USER = UUID.randomUUID();
    private static final String BASE = "/api/v1/restaurants/";
    @Autowired MockMvc mvc;
    @MockitoBean RestaurantRepository restaurants;
    @MockitoBean RestaurantSettingsRepository settings;
    @MockitoBean RestaurantFeaturedProductRepository featured;
    @MockitoBean CategoryRepository categories;
    @MockitoBean ProductRepository products;
    @MockitoBean ProductVariantRepository variants;
    @MockitoBean ProductModifierGroupRepository links;
    @MockitoBean ModifierGroupRepository groups;
    @MockitoBean ModifierOptionRepository options;
    @MockitoBean RestaurantMemberRepository members;
    @MockitoBean DeliveryRepository deliveries;
    private final Map<UUID, RestaurantFeaturedProduct> rows = new HashMap<>();
    private Product first, replacement, foreign;
    private Category category;

    @BeforeEach void setup() {
        rows.clear();
        category = category(A);
        first = product(A, category.getId(), "First", 1300L);
        replacement = product(A, category.getId(), "Replacement", 2700L);
        Category otherCategory = category(B);
        foreign = product(B, otherCategory.getId(), "Other tenant", 4900L);
        for (UUID id : List.of(A, B)) {
            Restaurant restaurant = new Restaurant(); restaurant.setId(id); restaurant.setName("Synthetic " + id);
            when(restaurants.findByIdAndIsActiveTrue(id)).thenReturn(Optional.of(restaurant));
            when(restaurants.findActiveForBrandingUpdate(id)).thenReturn(Optional.of(restaurant));
        }
        when(categories.findByRestaurantIdAndIsActiveTrueOrderByDisplayOrderAsc(A)).thenReturn(List.of(category));
        when(categories.findByRestaurantIdAndIsActiveTrueOrderByDisplayOrderAsc(B)).thenReturn(List.of(otherCategory));
        when(products.findByRestaurantIdAndCategoryIdInOrderByNameAsc(A, List.of(category.getId())))
                .thenReturn(List.of(first, replacement));
        when(products.findByRestaurantIdAndCategoryIdInOrderByNameAsc(B, List.of(otherCategory.getId())))
                .thenReturn(List.of(foreign));
        when(featured.findById(any())).thenAnswer(call -> Optional.ofNullable(rows.get(call.getArgument(0))));
        when(featured.saveAndFlush(any())).thenAnswer(call -> {
            RestaurantFeaturedProduct row = call.getArgument(0); rows.put(row.getRestaurantId(), row); return row;
        });
    }

    @Test void ownerSelectsReplacesClearsWithServerRevisionAndNoPriceMutation() throws Exception {
        member(A, RestaurantRole.OWNER);
        save(A, first.getId(), 0).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.restaurantId").value(A.toString()))
                .andExpect(jsonPath("$.productId").value(first.getId().toString()))
                .andExpect(jsonPath("$.status").value("AVAILABLE")).andExpect(jsonPath("$.revision").value(1));
        save(A, replacement.getId(), 1).andExpect(status().isOk()).andExpect(jsonPath("$.revision").value(2));
        menu(A).andExpect(jsonPath("$.featuredProduct.productId").value(replacement.getId().toString()))
                .andExpect(jsonPath("$.featuredProduct", aMapWithSize(2)))
                .andExpect(jsonPath("$.categories[0].products[0].price").value(1300));
        save(A, null, 2).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("NONE"))
                .andExpect(jsonPath("$.productId").value(nullValue())).andExpect(jsonPath("$.revision").value(3));
        verify(products, never()).save(any());
        verify(products, never()).reserveStock(any(), any(), anyInt());
        assertEquals(1300L, first.getPrice());
    }

    @ParameterizedTest @EnumSource(value = RestaurantRole.class, names = {"MANAGER", "STAFF", "DELIVERY_DRIVER"})
    void nonOwnersCannotChangeFeatured(RestaurantRole role) throws Exception {
        member(A, role);
        save(A, first.getId(), 0).andExpect(status().isForbidden());
        verifyNoInteractions(featured); verify(products, never()).findByIdAndRestaurantIdForUpdate(any(), any());
        if (role == RestaurantRole.MANAGER) {
            mvc.perform(get(BASE + A + "/featured-product").with(jwt().jwt(t -> t.subject(USER.toString()))))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("NONE"));
        }
    }

    @Test void anonymousAndForeignMembershipDeniedBeforeCatalogRead() throws Exception {
        mvc.perform(put(BASE + A + "/featured-product").contentType(MediaType.APPLICATION_JSON)
                        .content(body(first.getId(), 0))).andExpect(status().isUnauthorized());
        member(B, RestaurantRole.OWNER);
        save(A, first.getId(), 0).andExpect(status().isForbidden());
        verifyNoInteractions(featured, products);
    }

    @Test void ownerCannotSelectForeignOrUnknownProductAndCannotSkipExplicitClearKey() throws Exception {
        member(A, RestaurantRole.OWNER);
        save(A, foreign.getId(), 0).andExpect(status().isNotFound());
        save(A, UUID.randomUUID(), 0).andExpect(status().isNotFound());
        for (String request : List.of("{\"expectedRevision\":0}", "{\"productId\":\"invalid\",\"expectedRevision\":0}",
                "{\"productId\":null}", "{\"productId\":null,\"expectedRevision\":-1}",
                "{\"productId\":null,\"expectedRevision\":0.5}",
                "{\"productId\":null,\"expectedRevision\":0,\"ownerId\":\"spoof\"}")) {
            mvc.perform(put(BASE + A + "/featured-product").with(jwt().jwt(t -> t.subject(USER.toString())))
                            .contentType(MediaType.APPLICATION_JSON).content(request)).andExpect(status().isBadRequest());
        }
        verify(featured, never()).saveAndFlush(any());
    }

    @Test void staleOrDuplicateSubmissionCannotOverwriteAndTwoTenantsStayIndependent() throws Exception {
        member(A, RestaurantRole.OWNER); member(B, RestaurantRole.OWNER);
        save(A, first.getId(), 0).andExpect(status().isOk());
        save(B, foreign.getId(), 0).andExpect(status().isOk());
        save(A, replacement.getId(), 0).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("FEATURED_PRODUCT_STALE"));
        save(A, first.getId(), 0).andExpect(status().isConflict());
        menu(A).andExpect(jsonPath("$.featuredProduct.productId").value(first.getId().toString()));
        menu(B).andExpect(jsonPath("$.featuredProduct.productId").value(foreign.getId().toString()));
    }

    @Test void noneNeverInfersFirstProductOrPopularity() throws Exception {
        menu(A).andExpect(status().isOk()).andExpect(jsonPath("$.featuredProduct.status").value("NONE"))
                .andExpect(jsonPath("$.featuredProduct.productId").value(nullValue()));
        verifyNoInteractions(members, deliveries);
    }

    @ParameterizedTest @ValueSource(strings = {"unavailable", "stock", "category", "variant", "modifier", "price"})
    void unavailableSelectionRetainsUuidWithoutReplacementAndCannotBeNewlySelected(String reason) throws Exception {
        member(A, RestaurantRole.OWNER);
        save(A, first.getId(), 0).andExpect(status().isOk());
        switch (reason) {
            case "unavailable" -> first.setIsAvailable(false);
            case "price" -> first.setPrice(null);
            case "stock" -> { first.setTrackStock(true); first.setStockQuantity(0); }
            case "category" -> when(categories.findByRestaurantIdAndIsActiveTrueOrderByDisplayOrderAsc(A)).thenReturn(List.of());
            case "variant" -> {
                ProductVariant variant = new ProductVariant(); variant.setProductId(first.getId()); variant.setIsAvailable(false);
                when(variants.findByProductIdInOrderByNameAsc(any())).thenReturn(List.of(variant));
            }
            case "modifier" -> {
                ModifierGroup group = new ModifierGroup(); group.setId(UUID.randomUUID()); group.setName("Required");
                group.setIsRequired(true); group.setMinSelections(1); group.setMaxSelections(1);
                ProductModifierGroup link = new ProductModifierGroup();
                ProductModifierGroupId linkId = new ProductModifierGroupId();
                linkId.setProductId(first.getId()); linkId.setModifierGroupId(group.getId());
                link.setId(linkId); link.setRestaurantId(A);
                when(links.findById_ProductIdInAndRestaurantId(any(), eq(A))).thenReturn(List.of(link));
                when(groups.findByRestaurantIdAndIsActiveTrue(A)).thenReturn(List.of(group));
            }
        }
        menu(A).andExpect(jsonPath("$.featuredProduct.status").value("UNAVAILABLE"))
                .andExpect(jsonPath("$.featuredProduct.productId").value(first.getId().toString()));
        save(A, first.getId(), 1).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("FEATURED_PRODUCT_UNAVAILABLE"));
        save(A, null, 1).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("NONE"));
    }

    private org.springframework.test.web.servlet.ResultActions save(UUID tenant, UUID product, long revision) throws Exception {
        return mvc.perform(put(BASE + tenant + "/featured-product").with(jwt().jwt(t -> t.subject(USER.toString())))
                .contentType(MediaType.APPLICATION_JSON).content(body(product, revision)));
    }
    private String body(UUID product, long revision) {
        return "{\"productId\":" + (product == null ? "null" : "\"" + product + "\"") + ",\"expectedRevision\":" + revision + "}";
    }
    private org.springframework.test.web.servlet.ResultActions menu(UUID tenant) throws Exception {
        return mvc.perform(get("/api/v1/public/restaurants/" + tenant + "/menu"));
    }
    private void member(UUID tenant, RestaurantRole role) {
        RestaurantMember member = new RestaurantMember(); member.setRestaurantId(tenant); member.setUserId(USER); member.setRole(role);
        when(members.findByRestaurantIdAndUserId(tenant, USER)).thenReturn(Optional.of(member));
    }
    private Category category(UUID tenant) {
        Category value = new Category(); value.setId(UUID.randomUUID()); value.setRestaurantId(tenant);
        value.setName("Meals"); value.setDisplayOrder(0); return value;
    }
    private Product product(UUID tenant, UUID categoryId, String name, long price) {
        Product value = new Product(); value.setId(UUID.randomUUID()); value.setRestaurantId(tenant);
        value.setCategoryId(categoryId); value.setName(name); value.setPrice(price);
        when(products.findByIdAndRestaurantIdForUpdate(value.getId(), tenant)).thenReturn(Optional.of(value));
        return value;
    }
}
