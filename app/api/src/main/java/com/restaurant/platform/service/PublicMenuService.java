package com.restaurant.platform.service;

import com.restaurant.platform.dto.menu.MenuCategoryDto;
import com.restaurant.platform.dto.menu.MenuProductDto;
import com.restaurant.platform.dto.menu.MenuVariantDto;
import com.restaurant.platform.dto.menu.PublicMenuResponse;

import com.restaurant.platform.entity.Category;
import com.restaurant.platform.entity.Product;
import com.restaurant.platform.entity.ProductVariant;
import com.restaurant.platform.entity.Restaurant;
import com.restaurant.platform.entity.RestaurantSettings;

import com.restaurant.platform.repository.CategoryRepository;
import com.restaurant.platform.repository.ProductRepository;
import com.restaurant.platform.repository.ProductVariantRepository;
import com.restaurant.platform.repository.RestaurantRepository;
import com.restaurant.platform.repository.RestaurantSettingsRepository;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class PublicMenuService {

    private final RestaurantRepository restaurantRepository;
    private final RestaurantSettingsRepository settingsRepository;
    private final CategoryRepository categoryRepository;
    private final ProductRepository productRepository;
    private final ProductVariantRepository variantRepository;

    public PublicMenuService(
            RestaurantRepository restaurantRepository,
            RestaurantSettingsRepository settingsRepository,
            CategoryRepository categoryRepository,
            ProductRepository productRepository,
            ProductVariantRepository variantRepository
    ) {
        this.restaurantRepository = restaurantRepository;
        this.settingsRepository = settingsRepository;
        this.categoryRepository = categoryRepository;
        this.productRepository = productRepository;
        this.variantRepository = variantRepository;
    }

    @Transactional(readOnly = true)
    public PublicMenuResponse getMenu(UUID restaurantId) {

        // 1. Find an active restaurant.
        Restaurant restaurant = restaurantRepository
                .findByIdAndIsActiveTrue(restaurantId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Restaurant not found"
                ));

        // 2. Get active categories in display order.
        List<Category> categories =
                categoryRepository
                        .findByRestaurantIdAndIsActiveTrueOrderByDisplayOrderAsc(
                                restaurantId
                        );

        // 3. Get the restaurant's currency setting.
        String currency = settingsRepository
                .findById(restaurantId)
                .map(RestaurantSettings::getCurrency)
                .orElse(null);

        // If there are no active categories, return an empty menu.
        if (categories.isEmpty()) {
            return new PublicMenuResponse(
                    restaurant.getId(),
                    restaurant.getName(),
                    restaurant.getSlug(),
                    restaurant.getDescription(),
                    restaurant.getPhone(),
                    restaurant.getAddress(),
                    restaurant.getLogoUrl(),
                    currency,
                    List.of()
            );
        }

        List<UUID> categoryIds = categories.stream()
                .map(Category::getId)
                .toList();

        // 4. Get products for all active categories.
        List<Product> products =
                productRepository
                        .findByRestaurantIdAndCategoryIdInOrderByNameAsc(
                                restaurantId,
                                categoryIds
                        );

        // 5. Group products by category.
        Map<UUID, List<Product>> productsByCategory =
                products.stream()
                        .collect(Collectors.groupingBy(
                                Product::getCategoryId
                        ));

        // 6. Fetch variants in one query instead of one query per product.
        List<UUID> productIds = products.stream()
                .map(Product::getId)
                .toList();

        List<ProductVariant> variants = productIds.isEmpty()
                ? List.of()
                : variantRepository
                .findByProductIdInOrderByNameAsc(productIds);

        // 7. Group variants by product.
        Map<UUID, List<ProductVariant>> variantsByProduct =
                variants.stream()
                        .collect(Collectors.groupingBy(
                                ProductVariant::getProductId
                        ));

        // 8. Convert entities into response DTOs.
        List<MenuCategoryDto> categoryDtos = categories.stream()
                .map(category -> {

                    List<Product> categoryProducts =
                            productsByCategory.getOrDefault(
                                    category.getId(),
                                    List.of()
                            );

                    List<MenuProductDto> productDtos =
                            categoryProducts.stream()
                                    .map(product -> toProductDto(
                                            product,
                                            variantsByProduct.getOrDefault(
                                                    product.getId(),
                                                    List.of()
                                            )
                                    ))
                                    .toList();

                    return new MenuCategoryDto(
                            category.getId(),
                            category.getName(),
                            category.getDisplayOrder(),
                            productDtos
                    );
                })
                .toList();

        return new PublicMenuResponse(
                restaurant.getId(),
                restaurant.getName(),
                restaurant.getSlug(),
                restaurant.getDescription(),
                restaurant.getPhone(),
                restaurant.getAddress(),
                restaurant.getLogoUrl(),
                currency,
                categoryDtos
        );
    }

    private MenuProductDto toProductDto(
            Product product,
            List<ProductVariant> variants
    ) {

        List<MenuVariantDto> variantDtos = variants.stream()
                .map(variant -> new MenuVariantDto(
                        variant.getId(),
                        variant.getName(),
                        variant.getPrice(),
                        variant.getIsAvailable()
                ))
                .toList();

        boolean stockAvailable =
                !product.getTrackStock()
                        || (product.getStockQuantity() != null
                        && product.getStockQuantity() > 0);

        boolean isSelectable =
                product.getIsAvailable()
                        && (variantDtos.isEmpty()
                        || variantDtos.stream()
                        .anyMatch(MenuVariantDto::available));

        boolean availableForOrdering =
                product.getIsAvailable()
                        && stockAvailable
                        && isSelectable;

        return new MenuProductDto(
                product.getId(),
                product.getName(),
                product.getDescription(),
                product.getPrice(),
                product.getImageUrl(),
                availableForOrdering,
                product.getTrackStock(),
                product.getStockQuantity(),
                variantDtos
        );
    }
}