package com.restaurant.platform.service;

import com.restaurant.platform.entity.Category;
import com.restaurant.platform.entity.Product;
import com.restaurant.platform.entity.ProductVariant;
import com.restaurant.platform.entity.Restaurant;
import com.restaurant.platform.repository.*;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class PublicMenuVariantDescriptionTest {
    @Test
    void menuPublishesVariantSpecificUnicodeDescriptionAndLeavesLegacyVariantEmpty() {
        var restaurants = mock(RestaurantRepository.class);
        var categories = mock(CategoryRepository.class);
        var products = mock(ProductRepository.class);
        var variants = mock(ProductVariantRepository.class);
        var links = mock(ProductModifierGroupRepository.class);
        var service = new PublicMenuService(restaurants, mock(RestaurantSettingsRepository.class), categories,
                products, variants, links, mock(ModifierGroupRepository.class), mock(ModifierOptionRepository.class));
        UUID restaurantId = UUID.randomUUID(), categoryId = UUID.randomUUID(), productId = UUID.randomUUID();
        Restaurant restaurant = new Restaurant();
        restaurant.setId(restaurantId);
        restaurant.setName("Menu test");
        when(restaurants.findByIdAndIsActiveTrue(restaurantId)).thenReturn(Optional.of(restaurant));
        Category category = new Category();
        category.setId(categoryId);
        category.setName("Meals");
        category.setDisplayOrder(0);
        when(categories.findByRestaurantIdAndIsActiveTrueOrderByDisplayOrderAsc(restaurantId)).thenReturn(List.of(category));
        Product product = new Product();
        product.setId(productId);
        product.setCategoryId(categoryId);
        product.setName("Rice");
        product.setDescription("Product description");
        product.setIsAvailable(true);
        product.setTrackStock(false);
        when(products.findByRestaurantIdAndCategoryIdInOrderByNameAsc(restaurantId, List.of(categoryId))).thenReturn(List.of(product));
        ProductVariant described = new ProductVariant();
        described.setId(UUID.randomUUID());
        described.setProductId(productId);
        described.setName("Small");
        described.setPrice(1500L);
        described.setDescription("လူတစ်ယောက်အတွက်\nSingle serving.");
        ProductVariant legacy = new ProductVariant();
        legacy.setId(UUID.randomUUID());
        legacy.setProductId(productId);
        legacy.setName("Large");
        legacy.setPrice(2500L);
        when(variants.findByProductIdInOrderByNameAsc(List.of(productId))).thenReturn(List.of(described, legacy));

        var result = service.getMenu(restaurantId).categories().getFirst().products().getFirst();

        assertEquals(product.getDescription(), result.description());
        assertEquals(described.getDescription(), result.variants().getFirst().description());
        assertNull(result.variants().getLast().description());
        assertEquals(1500L, result.variants().getFirst().price());
        assertTrue(result.available());
        verify(variants).findByProductIdInOrderByNameAsc(List.of(productId));
    }
}
