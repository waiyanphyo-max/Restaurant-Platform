package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.menu.*;
import com.restaurant.platform.entity.*;
import com.restaurant.platform.repository.*;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.security.RestaurantPermission;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class CatalogManagementService {

    private final RestaurantRepository restaurantRepository;
    private final CategoryRepository categoryRepository;
    private final ProductRepository productRepository;
    private final ProductVariantRepository variantRepository;
    private final ProductModifierGroupRepository productModifierGroupRepository;
    private final ModifierGroupRepository modifierGroupRepository;
    private final ModifierOptionRepository modifierOptionRepository;
    private final RestaurantAuthorization authorization;

    public CatalogManagementService(
            RestaurantRepository restaurantRepository,
            CategoryRepository categoryRepository,
            ProductRepository productRepository,
            ProductVariantRepository variantRepository,
            ProductModifierGroupRepository productModifierGroupRepository,
            ModifierGroupRepository modifierGroupRepository,
            ModifierOptionRepository modifierOptionRepository,
            RestaurantAuthorization authorization) {
        this.restaurantRepository = restaurantRepository;
        this.categoryRepository = categoryRepository;
        this.productRepository = productRepository;
        this.variantRepository = variantRepository;
        this.productModifierGroupRepository = productModifierGroupRepository;
        this.modifierGroupRepository = modifierGroupRepository;
        this.modifierOptionRepository = modifierOptionRepository;
        this.authorization = authorization;
    }

    @Transactional(readOnly = true)
    public List<CategoryResponse> listCategories(UUID restaurantId, UUID userId) {
        requirePermission(restaurantId, userId, RestaurantPermission.MENU_READ);
        List<Category> categories = canManageMenu(restaurantId)
                ? categoryRepository.findByRestaurantIdOrderByDisplayOrderAsc(restaurantId)
                : categoryRepository.findByRestaurantIdAndIsActiveTrueOrderByDisplayOrderAsc(restaurantId);
        return categories.stream().map(this::toCategory).toList();
    }

    @Transactional
    public CategoryResponse createCategory(
            UUID restaurantId, UUID userId, CategoryRequest request) {
        requirePermission(restaurantId, userId, RestaurantPermission.MENU_MANAGE);
        if (request == null || request.name() == null || request.name().isBlank()) {
            throw badRequest("CATEGORY_NAME_REQUIRED", "error.catalog.category-name-required");
        }
        Category category = new Category();
        category.setRestaurantId(restaurantId);
        category.setName(request.name().trim());
        category.setDisplayOrder(request.displayOrder() == null ? 0 : request.displayOrder());
        category.setIsActive(request.active() == null || request.active());
        return toCategory(categoryRepository.save(category));
    }

    @Transactional
    public CategoryResponse updateCategory(
            UUID restaurantId, UUID userId, UUID categoryId, CategoryRequest request) {
        requirePermission(restaurantId, userId, RestaurantPermission.MENU_MANAGE);
        Category category = categoryRepository.findByIdAndRestaurantId(categoryId, restaurantId)
                .orElseThrow(() -> notFound("CATEGORY_NOT_FOUND", "error.catalog.category-not-found"));
        if (request == null || request.name() == null || request.name().isBlank()) {
            throw badRequest("CATEGORY_NAME_REQUIRED", "error.catalog.category-name-required");
        }
        category.setName(request.name().trim());
        if (request.displayOrder() != null) {
            category.setDisplayOrder(request.displayOrder());
        }
        if (request.active() != null) {
            category.setIsActive(request.active());
        }
        return toCategory(categoryRepository.save(category));
    }

    @Transactional(readOnly = true)
    public List<ProductManagementResponse> listProducts(UUID restaurantId, UUID userId) {
        requirePermission(restaurantId, userId, RestaurantPermission.MENU_READ);
        List<Product> products = canManageMenu(restaurantId)
                ? productRepository.findByRestaurantId(restaurantId)
                : productRepository.findByRestaurantIdAndIsAvailableTrue(restaurantId);
        return products.stream().map(this::toProduct).toList();
    }

    @Transactional
    public ProductManagementResponse createProduct(
            UUID restaurantId, UUID userId, ProductRequest request) {
        requirePermission(restaurantId, userId, RestaurantPermission.MENU_MANAGE);
        validateProductRequest(request);
        requireActiveCategory(restaurantId, request.categoryId());
        Product product = new Product();
        product.setRestaurantId(restaurantId);
        applyProduct(product, request);
        return toProduct(productRepository.save(product));
    }

    @Transactional
    public ProductManagementResponse updateProduct(
            UUID restaurantId, UUID userId, UUID productId, ProductRequest request) {
        requirePermission(restaurantId, userId, RestaurantPermission.MENU_MANAGE);
        validateProductRequest(request);
        Product product = productRepository.findByIdAndRestaurantId(productId, restaurantId)
                .orElseThrow(() -> notFound("PRODUCT_NOT_FOUND", "error.catalog.product-not-found"));
        requireActiveCategory(restaurantId, request.categoryId());
        applyProduct(product, request);
        return toProduct(productRepository.save(product));
    }

    @Transactional(readOnly = true)
    public List<ProductVariantResponse> listVariants(
            UUID restaurantId, UUID userId, UUID productId) {
        requirePermission(restaurantId, userId, RestaurantPermission.MENU_READ);
        requireProduct(restaurantId, productId);
        List<ProductVariant> variants = variantRepository.findByProductId(productId);
        if (!canManageMenu(restaurantId)) {
            variants = variants.stream()
                    .filter(variant -> Boolean.TRUE.equals(variant.getIsAvailable()))
                    .toList();
        }
        return variants.stream().map(this::toVariant).toList();
    }

    @Transactional
    public ProductVariantResponse createVariant(
            UUID restaurantId, UUID userId, UUID productId,
            ProductVariantRequest request) {
        requirePermission(restaurantId, userId, RestaurantPermission.MENU_MANAGE);
        requireProduct(restaurantId, productId);
        validateVariantRequest(request);
        ProductVariant variant = new ProductVariant();
        variant.setProductId(productId);
        variant.setName(request.name().trim());
        variant.setPrice(request.price());
        variant.setIsAvailable(request.available());
        return toVariant(variantRepository.save(variant));
    }

    @Transactional
    public ProductVariantResponse updateVariant(
            UUID restaurantId, UUID userId, UUID productId, UUID variantId,
            ProductVariantRequest request) {
        requirePermission(restaurantId, userId, RestaurantPermission.MENU_MANAGE);
        requireProduct(restaurantId, productId);
        validateVariantRequest(request);
        ProductVariant variant = variantRepository.findByIdAndProductId(variantId, productId)
                .orElseThrow(() -> notFound("PRODUCT_VARIANT_NOT_FOUND",
                        "error.catalog.variant-not-found"));
        variant.setName(request.name().trim());
        variant.setPrice(request.price());
        variant.setIsAvailable(request.available());
        return toVariant(variantRepository.save(variant));
    }

    @Transactional(readOnly = true)
    public List<ModifierGroupResponse> listModifierGroups(UUID restaurantId, UUID userId) {
        requirePermission(restaurantId, userId, RestaurantPermission.MENU_READ);
        boolean manage = canManageMenu(restaurantId);
        List<ModifierGroup> groups = manage
                ? modifierGroupRepository.findByRestaurantIdOrderByNameAsc(restaurantId)
                : modifierGroupRepository.findByRestaurantIdAndIsActiveTrue(restaurantId);
        return groups.stream().map(group -> toModifierGroup(group, manage)).toList();
    }

    @Transactional
    public ModifierGroupResponse createModifierGroup(
            UUID restaurantId, UUID userId, ModifierGroupRequest request) {
        requirePermission(restaurantId, userId, RestaurantPermission.MENU_MANAGE);
        if (request == null || request.name() == null || request.name().isBlank()) {
            throw badRequest("MODIFIER_GROUP_NAME_REQUIRED",
                    "error.catalog.modifier-group-name-required");
        }
        boolean required = Boolean.TRUE.equals(request.required());
        int min = request.minSelections() == null ? (required ? 1 : 0) : request.minSelections();
        int max = request.maxSelections() == null ? Math.max(min, 1) : request.maxSelections();
        validateSelectionRules(required, min, max);
        ModifierGroup group = new ModifierGroup();
        group.setRestaurantId(restaurantId);
        group.setName(request.name().trim());
        group.setIsRequired(required);
        group.setMinSelections(min);
        group.setMaxSelections(max);
        group.setIsActive(request.active() == null || request.active());
        return toModifierGroup(modifierGroupRepository.save(group), true);
    }

    @Transactional
    public ModifierGroupResponse updateModifierGroup(
            UUID restaurantId, UUID userId, UUID groupId, ModifierGroupRequest request) {
        requirePermission(restaurantId, userId, RestaurantPermission.MENU_MANAGE);
        ModifierGroup group = modifierGroupRepository.findByIdAndRestaurantId(groupId, restaurantId)
                .orElseThrow(() -> notFound("MODIFIER_GROUP_NOT_FOUND",
                        "error.catalog.modifier-group-not-found"));
        if (request == null || request.name() == null || request.name().isBlank()) {
            throw badRequest("MODIFIER_GROUP_NAME_REQUIRED",
                    "error.catalog.modifier-group-name-required");
        }
        boolean required = request.required() == null
                ? Boolean.TRUE.equals(group.getIsRequired()) : request.required();
        int min = request.minSelections() == null
                ? group.getMinSelections() : request.minSelections();
        int max = request.maxSelections() == null
                ? group.getMaxSelections() : request.maxSelections();
        validateSelectionRules(required, min, max);
        group.setName(request.name().trim());
        group.setIsRequired(required);
        group.setMinSelections(min);
        group.setMaxSelections(max);
        if (request.active() != null) {
            group.setIsActive(request.active());
        }
        return toModifierGroup(modifierGroupRepository.save(group), true);
    }

    @Transactional
    public ModifierOptionResponse createModifierOption(
            UUID restaurantId, UUID userId, UUID groupId,
            ModifierOptionRequest request) {
        requirePermission(restaurantId, userId, RestaurantPermission.MENU_MANAGE);
        requireModifierGroup(restaurantId, groupId, true);
        validateModifierOptionRequest(request);
        ModifierOption option = new ModifierOption();
        option.setRestaurantId(restaurantId);
        option.setModifierGroupId(groupId);
        option.setName(request.name().trim());
        option.setAdditionalPrice(request.additionalPrice());
        option.setIsAvailable(request.available());
        return toModifierOption(modifierOptionRepository.save(option));
    }

    @Transactional
    public ModifierOptionResponse updateModifierOption(
            UUID restaurantId, UUID userId, UUID groupId, UUID optionId,
            ModifierOptionRequest request) {
        requirePermission(restaurantId, userId, RestaurantPermission.MENU_MANAGE);
        requireModifierGroup(restaurantId, groupId, false);
        validateModifierOptionRequest(request);
        ModifierOption option = modifierOptionRepository
                .findByIdAndModifierGroupIdAndRestaurantId(optionId, groupId, restaurantId)
                .orElseThrow(() -> notFound("MODIFIER_OPTION_NOT_FOUND",
                        "error.catalog.modifier-option-not-found"));
        option.setName(request.name().trim());
        option.setAdditionalPrice(request.additionalPrice());
        option.setIsAvailable(request.available());
        return toModifierOption(modifierOptionRepository.save(option));
    }

    @Transactional
    public void attachModifierGroup(
            UUID restaurantId, UUID userId, UUID productId, UUID groupId) {
        requirePermission(restaurantId, userId, RestaurantPermission.MENU_MANAGE);
        requireProduct(restaurantId, productId);
        requireModifierGroup(restaurantId, groupId, true);
        ProductModifierGroupId id = new ProductModifierGroupId();
        id.setProductId(productId);
        id.setModifierGroupId(groupId);
        if (!productModifierGroupRepository.existsById(id)) {
            ProductModifierGroup association = new ProductModifierGroup();
            association.setId(id);
            association.setRestaurantId(restaurantId);
            productModifierGroupRepository.save(association);
        }
    }

    @Transactional
    public void detachModifierGroup(
            UUID restaurantId, UUID userId, UUID productId, UUID groupId) {
        requirePermission(restaurantId, userId, RestaurantPermission.MENU_MANAGE);
        requireProduct(restaurantId, productId);
        requireModifierGroup(restaurantId, groupId, false);
        ProductModifierGroupId id = new ProductModifierGroupId();
        id.setProductId(productId);
        id.setModifierGroupId(groupId);
        if (productModifierGroupRepository.existsById(id)) {
            productModifierGroupRepository.deleteById(id);
        }
    }

    @Transactional(readOnly = true)
    public List<ModifierGroupResponse> listProductModifierGroups(
            UUID restaurantId, UUID userId, UUID productId) {
        requirePermission(restaurantId, userId, RestaurantPermission.MENU_READ);
        requireProduct(restaurantId, productId);
        boolean manage = canManageMenu(restaurantId);
        List<UUID> ids = productModifierGroupRepository
                .findModifierGroupIdsByProductIdAndRestaurantId(productId, restaurantId);
        return ids.stream()
                .map(id -> manage
                        ? modifierGroupRepository.findByIdAndRestaurantId(id, restaurantId)
                        : modifierGroupRepository.findByIdAndRestaurantIdAndIsActiveTrue(id, restaurantId))
                .flatMap(java.util.Optional::stream)
                .map(group -> toModifierGroup(group, manage))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<ModifierGroupResponse> listPublicProductModifierGroups(
            UUID restaurantId, UUID productId) {
        restaurantRepository.findByIdAndIsActiveTrue(restaurantId)
                .orElseThrow(() -> notFound("RESTAURANT_NOT_FOUND",
                        "error.restaurant.not-found"));
        Product product = productRepository.findByIdAndRestaurantId(productId, restaurantId)
                .filter(p -> Boolean.TRUE.equals(p.getIsAvailable()))
                .orElseThrow(() -> notFound("PRODUCT_NOT_FOUND", "error.catalog.product-not-found"));
        categoryRepository.findByIdAndRestaurantIdAndIsActiveTrue(
                        product.getCategoryId(), restaurantId)
                .orElseThrow(() -> notFound("PRODUCT_NOT_AVAILABLE",
                        "error.catalog.product-not-available"));

        List<UUID> ids = productModifierGroupRepository
                .findModifierGroupIdsByProductIdAndRestaurantId(productId, restaurantId);
        return ids.stream()
                .map(id -> modifierGroupRepository.findByIdAndRestaurantIdAndIsActiveTrue(id, restaurantId))
                .flatMap(java.util.Optional::stream)
                .map(group -> toModifierGroup(group, false))
                .toList();
    }

    private ModifierGroupResponse toModifierGroup(ModifierGroup group, boolean manage) {
        List<ModifierOption> options = manage
                ? modifierOptionRepository.findByModifierGroupIdAndRestaurantIdOrderByNameAsc(
                        group.getId(), group.getRestaurantId())
                : modifierOptionRepository.findByModifierGroupIdAndRestaurantIdAndIsAvailableTrueOrderByNameAsc(
                        group.getId(), group.getRestaurantId());
        return new ModifierGroupResponse(
                group.getId(), group.getName(), Boolean.TRUE.equals(group.getIsRequired()),
                group.getMinSelections(), group.getMaxSelections(),
                Boolean.TRUE.equals(group.getIsActive()),
                options.stream().map(this::toModifierOption).toList());
    }

    private CategoryResponse toCategory(Category category) {
        return new CategoryResponse(
                category.getId(), category.getName(), category.getDisplayOrder(),
                Boolean.TRUE.equals(category.getIsActive()));
    }

    private ProductManagementResponse toProduct(Product product) {
        return new ProductManagementResponse(
                product.getId(), product.getCategoryId(), product.getName(),
                product.getDescription(), product.getPrice(), product.getImageUrl(),
                Boolean.TRUE.equals(product.getTrackStock()), product.getStockQuantity(),
                Boolean.TRUE.equals(product.getIsAvailable()),
                product.getCreatedAt(), product.getUpdatedAt());
    }

    private ProductVariantResponse toVariant(ProductVariant variant) {
        return new ProductVariantResponse(
                variant.getId(), variant.getProductId(), variant.getName(),
                variant.getPrice(), Boolean.TRUE.equals(variant.getIsAvailable()),
                variant.getCreatedAt(), variant.getUpdatedAt());
    }

    private ModifierOptionResponse toModifierOption(ModifierOption option) {
        return new ModifierOptionResponse(
                option.getId(), option.getModifierGroupId(), option.getName(),
                option.getAdditionalPrice(), Boolean.TRUE.equals(option.getIsAvailable()));
    }

    private boolean canManageMenu(UUID restaurantId) {
        return authorization.hasPermission(restaurantId, RestaurantPermission.MENU_MANAGE);
    }

    private void requirePermission(
            UUID restaurantId, UUID userId, RestaurantPermission permission) {
        authorization.requireAuthenticatedUserMatches(userId);
        authorization.requirePermission(restaurantId, permission);
    }

    private Category requireActiveCategory(UUID restaurantId, UUID categoryId) {
        return categoryRepository.findByIdAndRestaurantIdAndIsActiveTrue(categoryId, restaurantId)
                .orElseThrow(() -> badRequest("INVALID_PRODUCT_CATEGORY",
                        "error.catalog.category-not-available"));
    }

    private Product requireProduct(UUID restaurantId, UUID productId) {
        return productRepository.findByIdAndRestaurantId(productId, restaurantId)
                .orElseThrow(() -> notFound("PRODUCT_NOT_FOUND",
                        "error.catalog.product-not-found"));
    }

    private ModifierGroup requireModifierGroup(UUID restaurantId, UUID groupId, boolean mustBeActive) {
        return (mustBeActive
                ? modifierGroupRepository.findByIdAndRestaurantIdAndIsActiveTrue(groupId, restaurantId)
                : modifierGroupRepository.findByIdAndRestaurantId(groupId, restaurantId))
                .orElseThrow(() -> notFound("MODIFIER_GROUP_NOT_FOUND",
                        "error.catalog.modifier-group-not-found"));
    }

    private void validateProductRequest(ProductRequest request) {
        if (request == null || request.categoryId() == null
                || request.name() == null || request.name().isBlank()
                || request.price() == null || request.price() < 0
                || request.trackStock() == null || request.available() == null) {
            throw badRequest("INVALID_PRODUCT_REQUEST", "error.catalog.invalid-product");
        }
        if (Boolean.TRUE.equals(request.trackStock())
                && (request.stockQuantity() == null || request.stockQuantity() < 0)) {
            throw badRequest("INVALID_PRODUCT_STOCK", "error.catalog.invalid-stock");
        }
        if (!Boolean.TRUE.equals(request.trackStock())
                && request.stockQuantity() != null && request.stockQuantity() < 0) {
            throw badRequest("INVALID_PRODUCT_STOCK", "error.catalog.invalid-stock");
        }
    }

    private void applyProduct(Product product, ProductRequest request) {
        product.setCategoryId(request.categoryId());
        product.setName(request.name().trim());
        product.setDescription(clean(request.description()));
        product.setPrice(request.price());
        product.setImageUrl(clean(request.imageUrl()));
        product.setTrackStock(request.trackStock());
        product.setStockQuantity(Boolean.TRUE.equals(request.trackStock())
                ? request.stockQuantity() : null);
        product.setIsAvailable(request.available());
    }

    private void validateVariantRequest(ProductVariantRequest request) {
        if (request == null || request.name() == null || request.name().isBlank()
                || request.price() == null || request.price() < 0
                || request.available() == null) {
            throw badRequest("INVALID_PRODUCT_VARIANT", "error.catalog.invalid-variant");
        }
    }

    private void validateModifierOptionRequest(ModifierOptionRequest request) {
        if (request == null || request.name() == null || request.name().isBlank()
                || request.additionalPrice() == null || request.additionalPrice() < 0
                || request.available() == null) {
            throw badRequest("INVALID_MODIFIER_OPTION", "error.catalog.invalid-modifier-option");
        }
    }

    private void validateSelectionRules(boolean required, int min, int max) {
        if (min < 0 || max < min || (required && min < 1)) {
            throw badRequest("INVALID_MODIFIER_SELECTION_RULES",
                    "error.catalog.invalid-selection-rules");
        }
    }

    private String clean(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private ApiException badRequest(String code, String key) {
        return new ApiException(HttpStatus.BAD_REQUEST, code, key);
    }

    private ApiException notFound(String code, String key) {
        return new ApiException(HttpStatus.NOT_FOUND, code, key);
    }
}
