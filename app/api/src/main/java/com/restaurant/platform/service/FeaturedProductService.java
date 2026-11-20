package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.menu.*;
import com.restaurant.platform.entity.RestaurantFeaturedProduct;
import com.restaurant.platform.repository.ProductRepository;
import com.restaurant.platform.repository.RestaurantFeaturedProductRepository;
import com.restaurant.platform.repository.RestaurantRepository;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.security.RestaurantPermission;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.UUID;

@Service @RequiredArgsConstructor
public class FeaturedProductService {
    private static final long MAX_REVISION = 9007199254740991L;
    private final RestaurantAuthorization authorization;
    private final RestaurantRepository restaurants;
    private final ProductRepository products;
    private final RestaurantFeaturedProductRepository featured;
    private final PublicMenuService publicMenu;

    @Transactional(readOnly = true)
    public FeaturedProductResponse get(UUID restaurantId) {
        authorization.requirePermission(restaurantId, RestaurantPermission.MENU_READ);
        return response(restaurantId);
    }

    @Transactional
    public FeaturedProductResponse update(UUID restaurantId, UpdateFeaturedProductRequest request) {
        authorization.requirePermission(restaurantId, RestaurantPermission.FEATURED_MANAGE);
        if (request == null || request.expectedRevision() == null || request.expectedRevision() < 0
                || request.expectedRevision() > MAX_REVISION) throw invalid();
        // Lock the existing tenant parent even when no selection row exists yet.
        restaurants.findActiveForBrandingUpdate(restaurantId).orElseThrow(() ->
                new ApiException(HttpStatus.NOT_FOUND, "RESTAURANT_NOT_FOUND", "error.restaurant.not-found"));
        RestaurantFeaturedProduct row = featured.findById(restaurantId).orElse(null);
        long revision = row == null ? 0 : row.getRevision();
        if (request.expectedRevision() != revision) throw error(HttpStatus.CONFLICT, "FEATURED_PRODUCT_STALE");
        if (revision == MAX_REVISION) throw error(HttpStatus.CONFLICT, "FEATURED_PRODUCT_REVISION_EXHAUSTED");
        if (request.productId() != null) {
            products.findByIdAndRestaurantIdForUpdate(request.productId(), restaurantId).orElseThrow(() ->
                    new ApiException(HttpStatus.NOT_FOUND, "PRODUCT_NOT_FOUND", "error.catalog.product-not-found"));
            boolean eligible = publicMenu.getMenu(restaurantId).categories().stream()
                    .flatMap(category -> category.products().stream())
                    .anyMatch(product -> request.productId().equals(product.id()) && FeaturedProductDto.isEligible(product));
            if (!eligible) throw error(HttpStatus.BAD_REQUEST, "FEATURED_PRODUCT_UNAVAILABLE");
        }
        if (row == null) {
            row = new RestaurantFeaturedProduct();
            row.setRestaurantId(restaurantId);
        }
        row.setProductId(request.productId());
        row.setRevision(revision + 1);
        featured.saveAndFlush(row);
        return response(restaurantId);
    }

    private FeaturedProductResponse response(UUID restaurantId) {
        // Snapshot identity/revision together, including the absent-row case. A concurrent first
        // selection must never pair an old NONE value with its new revision.
        RestaurantFeaturedProduct row = featured.findById(restaurantId).orElse(null);
        UUID productId = row == null ? null : row.getProductId();
        long revision = row == null ? 0 : row.getRevision();
        var menu = publicMenu.getMenu(restaurantId);
        var status = productId == null ? FeaturedProductDto.Status.NONE
                : menu.categories().stream().flatMap(category -> category.products().stream())
                        .anyMatch(product -> productId.equals(product.id()) && FeaturedProductDto.isEligible(product))
                        ? FeaturedProductDto.Status.AVAILABLE : FeaturedProductDto.Status.UNAVAILABLE;
        return new FeaturedProductResponse(restaurantId, productId, status, revision);
    }

    private ApiException invalid() { return error(HttpStatus.BAD_REQUEST, "INVALID_FEATURED_PRODUCT"); }
    private ApiException error(HttpStatus status, String code) {
        return new ApiException(status, code, "error.catalog.featured");
    }
}
