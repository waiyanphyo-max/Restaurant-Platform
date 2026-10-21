package com.restaurant.platform.controller;

import com.restaurant.platform.dto.menu.*;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.service.CatalogManagementService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/restaurants/{restaurantId}")
@RequiredArgsConstructor
public class MenuManagementController {

    private final CatalogManagementService catalogService;
    private final RestaurantAuthorization authorization;

    @GetMapping("/categories")
    public List<CategoryResponse> listCategories(@PathVariable UUID restaurantId) {
        return catalogService.listCategories(
                restaurantId, authorization.requireAuthenticatedUserId());
    }

    @PostMapping("/categories")
    @ResponseStatus(HttpStatus.CREATED)
    public CategoryResponse createCategory(
            @PathVariable UUID restaurantId,
            @Valid @RequestBody CategoryRequest request) {
        return catalogService.createCategory(
                restaurantId, authorization.requireAuthenticatedUserId(), request);
    }

    @PutMapping("/categories/{categoryId}")
    public CategoryResponse updateCategory(
            @PathVariable UUID restaurantId,
            @PathVariable UUID categoryId,
            @Valid @RequestBody CategoryRequest request) {
        return catalogService.updateCategory(
                restaurantId, authorization.requireAuthenticatedUserId(), categoryId, request);
    }

    @GetMapping("/products")
    public List<ProductManagementResponse> listProducts(@PathVariable UUID restaurantId) {
        return catalogService.listProducts(
                restaurantId, authorization.requireAuthenticatedUserId());
    }

    @PostMapping("/products")
    @ResponseStatus(HttpStatus.CREATED)
    public ProductManagementResponse createProduct(
            @PathVariable UUID restaurantId,
            @Valid @RequestBody ProductRequest request) {
        return catalogService.createProduct(
                restaurantId, authorization.requireAuthenticatedUserId(), request);
    }

    @PutMapping("/products/{productId}")
    public ProductManagementResponse updateProduct(
            @PathVariable UUID restaurantId,
            @PathVariable UUID productId,
            @Valid @RequestBody ProductRequest request) {
        return catalogService.updateProduct(
                restaurantId, authorization.requireAuthenticatedUserId(), productId, request);
    }

    @GetMapping("/products/{productId}/variants")
    public List<ProductVariantResponse> listVariants(
            @PathVariable UUID restaurantId, @PathVariable UUID productId) {
        return catalogService.listVariants(
                restaurantId, authorization.requireAuthenticatedUserId(), productId);
    }

    @PostMapping("/products/{productId}/variants")
    @ResponseStatus(HttpStatus.CREATED)
    public ProductVariantResponse createVariant(
            @PathVariable UUID restaurantId,
            @PathVariable UUID productId,
            @Valid @RequestBody ProductVariantRequest request) {
        return catalogService.createVariant(
                restaurantId, authorization.requireAuthenticatedUserId(), productId, request);
    }

    @PutMapping("/products/{productId}/variants/{variantId}")
    public ProductVariantResponse updateVariant(
            @PathVariable UUID restaurantId,
            @PathVariable UUID productId,
            @PathVariable UUID variantId,
            @Valid @RequestBody ProductVariantRequest request) {
        return catalogService.updateVariant(
                restaurantId, authorization.requireAuthenticatedUserId(),
                productId, variantId, request);
    }

    @GetMapping("/modifier-groups")
    public List<ModifierGroupResponse> listModifierGroups(
            @PathVariable UUID restaurantId) {
        return catalogService.listModifierGroups(
                restaurantId, authorization.requireAuthenticatedUserId());
    }

    @PostMapping("/modifier-groups")
    @ResponseStatus(HttpStatus.CREATED)
    public ModifierGroupResponse createModifierGroup(
            @PathVariable UUID restaurantId,
            @Valid @RequestBody ModifierGroupRequest request) {
        return catalogService.createModifierGroup(
                restaurantId, authorization.requireAuthenticatedUserId(), request);
    }

    @PutMapping("/modifier-groups/{groupId}")
    public ModifierGroupResponse updateModifierGroup(
            @PathVariable UUID restaurantId,
            @PathVariable UUID groupId,
            @Valid @RequestBody ModifierGroupRequest request) {
        return catalogService.updateModifierGroup(
                restaurantId, authorization.requireAuthenticatedUserId(), groupId, request);
    }

    @PostMapping("/modifier-groups/{groupId}/options")
    @ResponseStatus(HttpStatus.CREATED)
    public ModifierOptionResponse createModifierOption(
            @PathVariable UUID restaurantId,
            @PathVariable UUID groupId,
            @Valid @RequestBody ModifierOptionRequest request) {
        return catalogService.createModifierOption(
                restaurantId, authorization.requireAuthenticatedUserId(), groupId, request);
    }

    @PutMapping("/modifier-groups/{groupId}/options/{optionId}")
    public ModifierOptionResponse updateModifierOption(
            @PathVariable UUID restaurantId,
            @PathVariable UUID groupId,
            @PathVariable UUID optionId,
            @Valid @RequestBody ModifierOptionRequest request) {
        return catalogService.updateModifierOption(
                restaurantId, authorization.requireAuthenticatedUserId(),
                groupId, optionId, request);
    }

    @GetMapping("/products/{productId}/modifier-groups")
    public List<ModifierGroupResponse> listProductModifierGroups(
            @PathVariable UUID restaurantId,
            @PathVariable UUID productId) {
        return catalogService.listProductModifierGroups(
                restaurantId, authorization.requireAuthenticatedUserId(), productId);
    }

    @PutMapping("/products/{productId}/modifier-groups/{groupId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void attachModifierGroup(
            @PathVariable UUID restaurantId,
            @PathVariable UUID productId,
            @PathVariable UUID groupId) {
        catalogService.attachModifierGroup(
                restaurantId, authorization.requireAuthenticatedUserId(), productId, groupId);
    }

    @DeleteMapping("/products/{productId}/modifier-groups/{groupId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void detachModifierGroup(
            @PathVariable UUID restaurantId,
            @PathVariable UUID productId,
            @PathVariable UUID groupId) {
        catalogService.detachModifierGroup(
                restaurantId, authorization.requireAuthenticatedUserId(), productId, groupId);
    }
}
