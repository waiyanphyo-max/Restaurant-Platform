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
        Product product = productRepository.findByIdAndRestaurantId(productId, restaurantId)
                .orElseThrow(() -> notFound("PRODUCT_NOT_FOUND", "error.catalog.product-not-found"));

        ImageUploadValidator.ValidatedImage image =
                imageValidator.validate(file, MAX_IMAGE_BYTES);
        String objectPath = restaurantId + "/products/" + productId + "/"
                + UUID.randomUUID() + "." + image.extension();
        String imageUrl = storageClient.uploadMenuImage(
                objectPath, image.contentType(), image.bytes());

        product.setImageUrl(imageUrl);
        Product saved = productRepository.save(product);
        return new ProductManagementResponse(
                saved.getId(), saved.getCategoryId(), saved.getName(), saved.getDescription(),
                saved.getPrice(), saved.getImageUrl(), Boolean.TRUE.equals(saved.getTrackStock()),
                saved.getStockQuantity(), Boolean.TRUE.equals(saved.getIsAvailable()),
                saved.getCreatedAt(), saved.getUpdatedAt());
    }

    public ProductVariantResponse uploadVariantImage(
            UUID restaurantId, UUID productId, UUID variantId, MultipartFile file) {
        authorization.requirePermission(restaurantId, RestaurantPermission.MENU_MANAGE);
        Product product = productRepository.findByIdAndRestaurantId(productId, restaurantId)
                .orElseThrow(() -> notFound("PRODUCT_NOT_FOUND", "error.catalog.product-not-found"));
        ProductVariant variant = variantRepository.findByIdAndProductId(variantId, productId)
                .orElseThrow(() -> notFound("PRODUCT_VARIANT_NOT_FOUND",
                        "error.catalog.variant-not-found"));

        ImageUploadValidator.ValidatedImage image =
                imageValidator.validate(file, MAX_IMAGE_BYTES);
        String objectPath = restaurantId + "/products/" + productId
                + "/variants/" + variantId + "/" + UUID.randomUUID() + "." + image.extension();
        String imageUrl = storageClient.uploadMenuImage(
                objectPath, image.contentType(), image.bytes());

        variant.setImageUrl(imageUrl);
        ProductVariant saved = variantRepository.save(variant);
        return new ProductVariantResponse(
                saved.getId(), saved.getProductId(), saved.getName(), saved.getPrice(),
                saved.getImageUrl(), Boolean.TRUE.equals(saved.getIsAvailable()),
                saved.getCreatedAt(), saved.getUpdatedAt());
    }

    private ApiException notFound(String code, String messageKey) {
        return new ApiException(HttpStatus.NOT_FOUND, code, messageKey);
    }
}
