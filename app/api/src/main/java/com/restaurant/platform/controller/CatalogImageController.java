package com.restaurant.platform.controller;

import com.restaurant.platform.dto.menu.ProductManagementResponse;
import com.restaurant.platform.dto.menu.ProductVariantResponse;
import com.restaurant.platform.service.CatalogImageService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/restaurants/{restaurantId}")
@RequiredArgsConstructor
public class CatalogImageController {
    private final CatalogImageService catalogImageService;

    @PostMapping(value = "/products/{productId}/image",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ProductManagementResponse uploadProductImage(
            @PathVariable UUID restaurantId,
            @PathVariable UUID productId,
            @RequestPart("file") MultipartFile file) {
        return catalogImageService.uploadProductImage(restaurantId, productId, file);
    }

    @PostMapping(value = "/products/{productId}/variants/{variantId}/image",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ProductVariantResponse uploadVariantImage(
            @PathVariable UUID restaurantId,
            @PathVariable UUID productId,
            @PathVariable UUID variantId,
            @RequestPart("file") MultipartFile file) {
        return catalogImageService.uploadVariantImage(restaurantId, productId, variantId, file);
    }
}
