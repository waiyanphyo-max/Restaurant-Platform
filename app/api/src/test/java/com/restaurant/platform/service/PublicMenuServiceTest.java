package com.restaurant.platform.service;

import com.restaurant.platform.dto.menu.MenuModifierGroupDto;
import com.restaurant.platform.dto.menu.PublicMenuResponse;
import com.restaurant.platform.entity.Category;
import com.restaurant.platform.entity.ModifierGroup;
import com.restaurant.platform.entity.ModifierOption;
import com.restaurant.platform.entity.Product;
import com.restaurant.platform.entity.ProductModifierGroup;
import com.restaurant.platform.entity.ProductModifierGroupId;
import com.restaurant.platform.entity.Restaurant;
import com.restaurant.platform.entity.RestaurantSettings;
import com.restaurant.platform.repository.CategoryRepository;
import com.restaurant.platform.repository.ModifierGroupRepository;
import com.restaurant.platform.repository.ModifierOptionRepository;
import com.restaurant.platform.repository.ProductModifierGroupRepository;
import com.restaurant.platform.repository.ProductRepository;
import com.restaurant.platform.repository.ProductVariantRepository;
import com.restaurant.platform.repository.RestaurantRepository;
import com.restaurant.platform.repository.RestaurantSettingsRepository;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class PublicMenuServiceTest {

    private RestaurantRepository restaurantRepository;
    private RestaurantSettingsRepository settingsRepository;
    private CategoryRepository categoryRepository;
    private ProductRepository productRepository;
    private ProductVariantRepository variantRepository;
    private ProductModifierGroupRepository productModifierGroupRepository;
    private ModifierGroupRepository modifierGroupRepository;
    private ModifierOptionRepository modifierOptionRepository;
    private PublicMenuService service;

    private final UUID restaurantId = UUID.randomUUID();
    private final UUID categoryId = UUID.randomUUID();
    private final UUID productId = UUID.randomUUID();
    private final UUID groupId = UUID.randomUUID();
    private final UUID optionId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        restaurantRepository = mock(RestaurantRepository.class);
        settingsRepository = mock(RestaurantSettingsRepository.class);
        categoryRepository = mock(CategoryRepository.class);
        productRepository = mock(ProductRepository.class);
        variantRepository = mock(ProductVariantRepository.class);
        productModifierGroupRepository = mock(ProductModifierGroupRepository.class);
        modifierGroupRepository = mock(ModifierGroupRepository.class);
        modifierOptionRepository = mock(ModifierOptionRepository.class);

        service = new PublicMenuService(
                restaurantRepository,
                settingsRepository,
                categoryRepository,
                productRepository,
                variantRepository,
                productModifierGroupRepository,
                modifierGroupRepository,
                modifierOptionRepository);
    }

    @Test
    void publicMenuIncludesOnlyAttachedActiveModifierGroupsAndAvailableOptions() {
        Restaurant restaurant = new Restaurant();
        restaurant.setId(restaurantId);
        restaurant.setName("Example Kitchen");
        restaurant.setSlug("example-kitchen");
        when(restaurantRepository.findByIdAndIsActiveTrue(restaurantId))
                .thenReturn(Optional.of(restaurant));

        RestaurantSettings settings = new RestaurantSettings();
        settings.setCurrency("MMK");
        when(settingsRepository.findById(restaurantId)).thenReturn(Optional.of(settings));

        Category category = new Category();
        category.setId(categoryId);
        category.setRestaurantId(restaurantId);
        category.setName("Noodles");
        category.setDisplayOrder(0);
        when(categoryRepository.findByRestaurantIdAndIsActiveTrueOrderByDisplayOrderAsc(
                restaurantId)).thenReturn(List.of(category));

        Product product = new Product();
        product.setId(productId);
        product.setRestaurantId(restaurantId);
        product.setCategoryId(categoryId);
        product.setName("Shan Noodles");
        product.setPrice(2500L);
        product.setTrackStock(false);
        product.setIsAvailable(true);
        when(productRepository.findByRestaurantIdAndCategoryIdInOrderByNameAsc(
                eq(restaurantId), anyList())).thenReturn(List.of(product));
        when(variantRepository.findByProductIdInOrderByNameAsc(List.of(productId)))
                .thenReturn(List.of());

        ProductModifierGroupId linkId = new ProductModifierGroupId();
        linkId.setProductId(productId);
        linkId.setModifierGroupId(groupId);
        ProductModifierGroup link = new ProductModifierGroup();
        link.setId(linkId);
        link.setRestaurantId(restaurantId);
        when(productModifierGroupRepository.findById_ProductIdInAndRestaurantId(
                List.of(productId), restaurantId)).thenReturn(List.of(link));

        ModifierGroup group = new ModifierGroup();
        group.setId(groupId);
        group.setRestaurantId(restaurantId);
        group.setName("Spice level");
        group.setIsRequired(true);
        group.setMinSelections(1);
        group.setMaxSelections(1);
        group.setIsActive(true);
        when(modifierGroupRepository.findByRestaurantIdAndIsActiveTrue(restaurantId))
                .thenReturn(List.of(group));

        ModifierOption option = new ModifierOption();
        option.setId(optionId);
        option.setRestaurantId(restaurantId);
        option.setModifierGroupId(groupId);
        option.setName("Mild");
        option.setAdditionalPrice(100L);
        option.setIsAvailable(true);
        when(modifierOptionRepository
                .findByModifierGroupIdInAndRestaurantIdAndIsAvailableTrueOrderByNameAsc(
                        List.of(groupId), restaurantId))
                .thenReturn(List.of(option));

        PublicMenuResponse menu = service.getMenu(restaurantId);

        assertEquals("MMK", menu.currency());
        var menuProduct = menu.categories().getFirst().products().getFirst();
        assertEquals(productId, menuProduct.id());
        assertTrue(menuProduct.available());
        assertEquals(1, menuProduct.modifierGroups().size());

        MenuModifierGroupDto modifierGroup = menuProduct.modifierGroups().getFirst();
        assertEquals(groupId, modifierGroup.id());
        assertTrue(modifierGroup.required());
        assertEquals(1, modifierGroup.minSelections());
        assertEquals(1, modifierGroup.maxSelections());
        assertEquals(1, modifierGroup.options().size());
        assertEquals(optionId, modifierGroup.options().getFirst().id());
        assertEquals(100L, modifierGroup.options().getFirst().additionalPrice());
    }

    @Test
    void publicMenuMarksProductUnavailableWhenRequiredModifierChoicesAreInsufficient() {
        Restaurant restaurant = new Restaurant();
        restaurant.setId(restaurantId);
        restaurant.setName("Example Kitchen");
        restaurant.setSlug("example-kitchen");
        when(restaurantRepository.findByIdAndIsActiveTrue(restaurantId))
                .thenReturn(Optional.of(restaurant));
        when(settingsRepository.findById(restaurantId)).thenReturn(Optional.empty());

        Category category = new Category();
        category.setId(categoryId);
        category.setRestaurantId(restaurantId);
        category.setName("Noodles");
        when(categoryRepository.findByRestaurantIdAndIsActiveTrueOrderByDisplayOrderAsc(
                restaurantId)).thenReturn(List.of(category));

        Product product = new Product();
        product.setId(productId);
        product.setRestaurantId(restaurantId);
        product.setCategoryId(categoryId);
        product.setName("Shan Noodles");
        product.setPrice(2500L);
        product.setTrackStock(false);
        product.setIsAvailable(true);
        when(productRepository.findByRestaurantIdAndCategoryIdInOrderByNameAsc(
                eq(restaurantId), anyList())).thenReturn(List.of(product));
        when(variantRepository.findByProductIdInOrderByNameAsc(List.of(productId)))
                .thenReturn(List.of());

        ProductModifierGroupId linkId = new ProductModifierGroupId();
        linkId.setProductId(productId);
        linkId.setModifierGroupId(groupId);
        ProductModifierGroup link = new ProductModifierGroup();
        link.setId(linkId);
        link.setRestaurantId(restaurantId);
        when(productModifierGroupRepository.findById_ProductIdInAndRestaurantId(
                List.of(productId), restaurantId)).thenReturn(List.of(link));

        ModifierGroup requiredGroup = new ModifierGroup();
        requiredGroup.setId(groupId);
        requiredGroup.setRestaurantId(restaurantId);
        requiredGroup.setName("Required sauce");
        requiredGroup.setMinSelections(1);
        requiredGroup.setMaxSelections(1);
        requiredGroup.setIsRequired(true);
        requiredGroup.setIsActive(true);
        when(modifierGroupRepository.findByRestaurantIdAndIsActiveTrue(restaurantId))
                .thenReturn(List.of(requiredGroup));
        when(modifierOptionRepository
                .findByModifierGroupIdInAndRestaurantIdAndIsAvailableTrueOrderByNameAsc(
                        List.of(groupId), restaurantId))
                .thenReturn(List.of());

        PublicMenuResponse menu = service.getMenu(restaurantId);

        var menuProduct = menu.categories().getFirst().products().getFirst();
        assertFalse(menuProduct.available());
        assertTrue(menuProduct.modifierGroups().getFirst().options().isEmpty());
    }
}
