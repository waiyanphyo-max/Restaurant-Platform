package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.menu.ProductManagementResponse;
import com.restaurant.platform.dto.menu.ProductVariantResponse;
import com.restaurant.platform.entity.Product;
import com.restaurant.platform.entity.ProductVariant;
import com.restaurant.platform.repository.ProductRepository;
import com.restaurant.platform.repository.ProductVariantRepository;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.security.RestaurantPermission;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.util.UUID;

/** Enforces restaurant scope before uploading product and variant images. */
@Service
public class CatalogImageService {
    public static final long MAX_IMAGE_BYTES = 5L * 1024L * 1024L;

    private final ProductRepository productRepository;
    private final ProductVariantRepository variantRepository;
    private final RestaurantAuthorization authorization;
    private final ImageUploadValidator imageValidator;
    private final SupabaseMediaStorageClient storageClient;

    public CatalogImageService(
            ProductRepository productRepository,
            ProductVariantRepository variantRepository,
            RestaurantAuthorization authorization,
            ImageUploadValidator imageValidator,
            SupabaseMediaStorageClient storageClient) {
        this.productRepository = productRepository;
        this.variantRepository = variantRepository;
        this.authorization = authorization;
        this.imageValidator = imageValidator;
        this.storageClient = storageClient;
    }

    public ProductManagementResponse uploadProductImage(
            UUID restaurantId, UUID productId, MultipartFile file) {
        authorization.requirePermission(restaurantId, RestaurantPermission.MENU_MANAGE);
        requireProduct(restaurantId, productId);

        ImageUploadValidator.ValidatedImage image =
                imageValidator.validate(file, MAX_IMAGE_BYTES);
        String objectPath = restaurantId + "/products/" + productId + "/"
                + UUID.randomUUID() + "." + image.extension();
        String imageUrl = storageClient.uploadMenuImage(
                objectPath, image.contentType(), image.bytes());

        // Storage can take time. Do not merge a product snapshot that predates a stock update.
        if (productRepository.updateProductImage(productId, restaurantId, imageUrl) == 0) {
            throw productNotFound();
        }
        Product saved = requireProduct(restaurantId, productId);
        return new ProductManagementResponse(
                saved.getId(), saved.getCategoryId(), saved.getName(), saved.getDescription(),
                saved.getPrice(), saved.getImageUrl(), Boolean.TRUE.equals(saved.getTrackStock()),
                saved.getVisibleStockQuantity(), Boolean.TRUE.equals(saved.getIsAvailable()),
                saved.getCreatedAt(), saved.getUpdatedAt());
    }

    public ProductVariantResponse uploadVariantImage(
            UUID restaurantId, UUID productId, UUID variantId, MultipartFile file) {
        authorization.requirePermission(restaurantId, RestaurantPermission.MENU_MANAGE);
        requireProduct(restaurantId, productId);
        requireVariant(productId, variantId);

        ImageUploadValidator.ValidatedImage image =
                imageValidator.validate(file, MAX_IMAGE_BYTES);
        String objectPath = restaurantId + "/products/" + productId
                + "/variants/" + variantId + "/" + UUID.randomUUID() + "." + image.extension();
        String imageUrl = storageClient.uploadMenuImage(
                objectPath, image.contentType(), image.bytes());

        if (variantRepository.updateVariantImage(variantId, productId, imageUrl) == 0) {
            throw variantNotFound();
        }
        ProductVariant saved = requireVariant(productId, variantId);
        return new ProductVariantResponse(
                saved.getId(), saved.getProductId(), saved.getName(), saved.getPrice(),
                saved.getImageUrl(), Boolean.TRUE.equals(saved.getIsAvailable()),
                saved.getCreatedAt(), saved.getUpdatedAt());
    }

    private Product requireProduct(UUID restaurantId, UUID productId) {
        return productRepository.findByIdAndRestaurantId(productId, restaurantId)
                .orElseThrow(this::productNotFound);
    }

    private ProductVariant requireVariant(UUID productId, UUID variantId) {
        return variantRepository.findByIdAndProductId(variantId, productId)
                .orElseThrow(this::variantNotFound);
    }

    private ApiException productNotFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "PRODUCT_NOT_FOUND", "error.catalog.product-not-found");
    }

    private ApiException variantNotFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "PRODUCT_VARIANT_NOT_FOUND", "error.catalog.variant-not-found");
    }
}
