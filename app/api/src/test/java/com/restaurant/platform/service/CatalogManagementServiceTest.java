package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.menu.ModifierGroupRequest;
import com.restaurant.platform.dto.menu.ProductRequest;
import com.restaurant.platform.dto.menu.ProductVariantRequest;
import com.restaurant.platform.entity.*;
import com.restaurant.platform.repository.*;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.security.RestaurantPermission;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class CatalogManagementServiceTest {
    private RestaurantRepository restaurantRepository;
    private CategoryRepository categoryRepository;
    private ProductRepository productRepository;
    private ProductVariantRepository variantRepository;
    private ProductModifierGroupRepository productModifierGroupRepository;
    private ModifierGroupRepository modifierGroupRepository;
    private ModifierOptionRepository modifierOptionRepository;
    private RestaurantAuthorization authorization;
    private CatalogManagementService service;

    private final UUID restaurantId = UUID.randomUUID();
    private final UUID userId = UUID.randomUUID();
    private final UUID productId = UUID.randomUUID();
    private final UUID categoryId = UUID.randomUUID();
    private final UUID groupId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        restaurantRepository = mock(RestaurantRepository.class);
        categoryRepository = mock(CategoryRepository.class);
        productRepository = mock(ProductRepository.class);
        variantRepository = mock(ProductVariantRepository.class);
        productModifierGroupRepository = mock(ProductModifierGroupRepository.class);
        modifierGroupRepository = mock(ModifierGroupRepository.class);
        modifierOptionRepository = mock(ModifierOptionRepository.class);
        authorization = mock(RestaurantAuthorization.class);
        service = new CatalogManagementService(
                restaurantRepository, categoryRepository, productRepository,
                variantRepository, productModifierGroupRepository,
                modifierGroupRepository, modifierOptionRepository, authorization);
    }

    @Test
    void productCannotBeCreatedUnderInactiveOrForeignCategory() {
        when(categoryRepository.findByIdAndRestaurantIdAndIsActiveTrue(categoryId, restaurantId))
                .thenReturn(Optional.empty());
        ProductRequest request = new ProductRequest(
                categoryId, "Tea", null, 1000L, null, false, null, true);

        ApiException error = assertThrows(ApiException.class,
                () -> service.createProduct(restaurantId, userId, request));

        assertEquals("INVALID_PRODUCT_CATEGORY", error.getCode());
        assertEquals(HttpStatus.BAD_REQUEST, error.getStatus());
        verify(authorization).requirePermission(restaurantId, RestaurantPermission.MENU_MANAGE);
        verify(productRepository, never()).save(any(Product.class));
    }

    @Test
    void stockTrackedProductMustHaveNonNegativeStockQuantity() {
        ProductRequest request = new ProductRequest(
                categoryId, "Tea", null, 1000L, null, true, null, true);

        ApiException error = assertThrows(ApiException.class,
                () -> service.createProduct(restaurantId, userId, request));

        assertEquals("INVALID_PRODUCT_STOCK", error.getCode());
        verify(categoryRepository, never()).findByIdAndRestaurantIdAndIsActiveTrue(any(), any());
        verify(productRepository, never()).save(any(Product.class));
    }

    @Test
    void invalidRequiredModifierSelectionRulesAreRejected() {
        ModifierGroupRequest request =
                new ModifierGroupRequest("Sugar", true, 0, 1, true);

        ApiException error = assertThrows(ApiException.class,
                () -> service.createModifierGroup(restaurantId, userId, request));

        assertEquals("INVALID_MODIFIER_SELECTION_RULES", error.getCode());
        assertEquals(HttpStatus.BAD_REQUEST, error.getStatus());
        verify(modifierGroupRepository, never()).save(any(ModifierGroup.class));
    }

    @Test
    void variantUpdateIsScopedToItsParentProduct() {
        when(productRepository.findByIdAndRestaurantId(productId, restaurantId))
                .thenReturn(Optional.of(product()));
        when(variantRepository.findByIdAndProductId(any(UUID.class), eq(productId)))
                .thenReturn(Optional.empty());

        ApiException error = assertThrows(ApiException.class,
                () -> service.updateVariant(restaurantId, userId, productId,
                        UUID.randomUUID(), new ProductVariantRequest("Large", 1500L, true)));

        assertEquals("PRODUCT_VARIANT_NOT_FOUND", error.getCode());
        verify(variantRepository, never()).save(any(ProductVariant.class));
    }

    @Test
    void publicModifierListingUsesRestaurantScopedActiveGroupAndOptions() {
        when(restaurantRepository.findByIdAndIsActiveTrue(restaurantId))
                .thenReturn(Optional.of(new Restaurant()));
        when(productRepository.findByIdAndRestaurantId(productId, restaurantId))
                .thenReturn(Optional.of(product()));
        when(categoryRepository.findByIdAndRestaurantIdAndIsActiveTrue(categoryId, restaurantId))
                .thenReturn(Optional.of(category()));
        when(productModifierGroupRepository.findModifierGroupIdsByProductIdAndRestaurantId(
                productId, restaurantId)).thenReturn(List.of(groupId));
        ModifierGroup group = new ModifierGroup();
        group.setId(groupId);
        group.setRestaurantId(restaurantId);
        group.setName("Sugar");
        group.setIsRequired(true);
        group.setMinSelections(1);
        group.setMaxSelections(1);
        group.setIsActive(true);
        when(modifierGroupRepository.findByIdAndRestaurantIdAndIsActiveTrue(groupId, restaurantId))
                .thenReturn(Optional.of(group));
        ModifierOption option = new ModifierOption();
        option.setId(UUID.randomUUID());
        option.setRestaurantId(restaurantId);
        option.setModifierGroupId(groupId);
        option.setName("Less sugar");
        option.setAdditionalPrice(0L);
        option.setIsAvailable(true);
        when(modifierOptionRepository
                .findByModifierGroupIdAndRestaurantIdAndIsAvailableTrueOrderByNameAsc(
                        groupId, restaurantId)).thenReturn(List.of(option));

        var response = service.listPublicProductModifierGroups(restaurantId, productId);

        assertEquals(1, response.size());
        assertEquals(groupId, response.getFirst().id());
        assertEquals("Less sugar", response.getFirst().options().getFirst().name());
        verify(modifierGroupRepository).findByIdAndRestaurantIdAndIsActiveTrue(groupId, restaurantId);
        verify(modifierOptionRepository)
                .findByModifierGroupIdAndRestaurantIdAndIsAvailableTrueOrderByNameAsc(groupId, restaurantId);
    }

    private Product product() {
        Product product = new Product();
        product.setId(productId);
        product.setRestaurantId(restaurantId);
        product.setCategoryId(categoryId);
        product.setName("Tea");
        product.setPrice(1000L);
        product.setTrackStock(false);
        product.setIsAvailable(true);
        return product;
    }

    private Category category() {
        Category category = new Category();
        category.setId(categoryId);
        category.setRestaurantId(restaurantId);
        category.setName("Drinks");
        category.setIsActive(true);
        return category;
    }
}
