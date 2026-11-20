package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.entity.Product;
import com.restaurant.platform.entity.ProductVariant;
import com.restaurant.platform.entity.RestaurantMember;
import com.restaurant.platform.repository.DeliveryRepository;
import com.restaurant.platform.repository.ProductRepository;
import com.restaurant.platform.repository.ProductVariantRepository;
import com.restaurant.platform.repository.RestaurantMemberRepository;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.security.RestaurantRole;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** Catalog upload authorization and persisted result semantics, without a live Storage request. */
class CatalogImageServiceTest {
    private final UUID restaurantId = UUID.randomUUID(), productId = UUID.randomUUID();
    private final UUID variantId = UUID.randomUUID(), ownerId = UUID.randomUUID();
    private final byte[] png = {(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A};
    private ProductRepository products;
    private ProductVariantRepository variants;
    private RestaurantMemberRepository members;
    private SupabaseMediaStorageClient storage;
    private CatalogImageService service;

    @BeforeEach
    void setUp() {
        products = mock(ProductRepository.class);
        variants = mock(ProductVariantRepository.class);
        members = mock(RestaurantMemberRepository.class);
        storage = mock(SupabaseMediaStorageClient.class);
        var authorization = new RestaurantAuthorization(members, mock(DeliveryRepository.class));
        service = new CatalogImageService(products, variants, authorization, new ImageUploadValidator(), storage);
        var owner = new RestaurantMember();
        owner.setRestaurantId(restaurantId);
        owner.setUserId(ownerId);
        owner.setRole(RestaurantRole.OWNER);
        when(members.findByRestaurantIdAndUserId(restaurantId, ownerId)).thenReturn(Optional.of(owner));
        var jwt = Jwt.withTokenValue("verified-test-token").header("alg", "ES256")
                .subject(ownerId.toString()).build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt, List.of()));
        when(products.findByIdAndRestaurantId(productId, restaurantId)).thenReturn(Optional.of(product(null, 10)));
        when(variants.findByIdAndProductId(variantId, productId)).thenReturn(Optional.of(variant(null, 1000L)));
    }

    @AfterEach
    void preserveIdentityAndClearSession() {
        verify(members, never()).save(any());
        verify(members, never()).delete(any());
        SecurityContextHolder.clearContext();
    }

    @Test
    void productUploadUsesScopedStorageUrlAndReturnsFreshProductWithoutOverwritingStock() {
        String publicUrl = "https://media.example.test/menu-images/product.png";
        when(storage.uploadMenuImage(anyString(), eq("image/png"), any(byte[].class))).thenReturn(publicUrl);
        when(products.updateProductImage(productId, restaurantId, publicUrl)).thenReturn(1);
        when(products.findByIdAndRestaurantId(productId, restaurantId))
                .thenReturn(Optional.of(product(null, 10)), Optional.of(product(publicUrl, 9)));

        var result = service.uploadProductImage(restaurantId, productId, file());

        assertEquals(productId, result.id());
        assertEquals(publicUrl, result.imageUrl());
        assertEquals(9, result.stockQuantity());
        verify(storage).uploadMenuImage(argThat(path -> path.startsWith(restaurantId + "/products/" + productId + "/")
                        && !path.contains("/variants/") && path.endsWith(".png")), eq("image/png"),
                argThat(bytes -> Arrays.equals(bytes, png)));
        verify(products).updateProductImage(productId, restaurantId, publicUrl);
        verify(products, never()).save(any());
        verifyNoInteractions(variants);
    }

    @Test
    void variantUploadKeepsParentScopeAndReturnsFreshPriceAlongsidePersistedUrl() {
        String publicUrl = "https://media.example.test/menu-images/variant.png";
        when(storage.uploadMenuImage(anyString(), eq("image/png"), any(byte[].class))).thenReturn(publicUrl);
        when(variants.updateVariantImage(variantId, productId, publicUrl)).thenReturn(1);
        when(variants.findByIdAndProductId(variantId, productId))
                .thenReturn(Optional.of(variant(null, 1000L)), Optional.of(variant(publicUrl, 1300L)));

        var result = service.uploadVariantImage(restaurantId, productId, variantId, file());

        assertEquals(variantId, result.id());
        assertEquals(productId, result.productId());
        assertEquals(publicUrl, result.imageUrl());
        assertEquals(1300L, result.price());
        assertEquals("Suitable for sharing.", result.description());
        verify(storage).uploadMenuImage(argThat(path -> path.startsWith(restaurantId + "/products/"
                        + productId + "/variants/" + variantId + "/") && path.endsWith(".png")),
                eq("image/png"), argThat(bytes -> Arrays.equals(bytes, png)));
        verify(variants).updateVariantImage(variantId, productId, publicUrl);
        verify(variants, never()).save(any());
        verify(products, never()).updateProductImage(any(), any(), any());
    }

    @Test
    void signedOutCallerCannotReadCatalogOrUpload() {
        SecurityContextHolder.clearContext();

        assertEquals(HttpStatus.UNAUTHORIZED, assertThrows(ApiException.class,
                () -> service.uploadProductImage(restaurantId, productId, file())).getStatus());
        assertEquals(HttpStatus.UNAUTHORIZED, assertThrows(ApiException.class,
                () -> service.uploadVariantImage(restaurantId, productId, variantId, file())).getStatus());

        verifyNoInteractions(products, variants, storage, members);
    }

    @Test
    void anotherRestaurantIsDeniedBeforeProductOrStorageAccess() {
        UUID otherRestaurant = UUID.randomUUID();

        assertEquals(HttpStatus.FORBIDDEN, assertThrows(ApiException.class,
                () -> service.uploadProductImage(otherRestaurant, productId, file())).getStatus());
        assertEquals(HttpStatus.FORBIDDEN, assertThrows(ApiException.class,
                () -> service.uploadVariantImage(otherRestaurant, productId, variantId, file())).getStatus());

        verifyNoInteractions(products, variants, storage);
    }

    @Test
    void productOutsideTheAuthorizedRestaurantCannotReachStorage() {
        UUID otherProduct = UUID.randomUUID();

        assertEquals("PRODUCT_NOT_FOUND", assertThrows(ApiException.class,
                () -> service.uploadProductImage(restaurantId, otherProduct, file())).getCode());
        assertEquals("PRODUCT_NOT_FOUND", assertThrows(ApiException.class,
                () -> service.uploadVariantImage(restaurantId, otherProduct, variantId, file())).getCode());

        verifyNoInteractions(variants, storage);
        verify(products, never()).updateProductImage(any(), any(), any());
    }

    @Test
    void variantOutsideItsParentProductCannotReachStorage() {
        UUID otherVariant = UUID.randomUUID();

        assertEquals("PRODUCT_VARIANT_NOT_FOUND", assertThrows(ApiException.class,
                () -> service.uploadVariantImage(restaurantId, productId, otherVariant, file())).getCode());

        verifyNoInteractions(storage);
        verify(variants, never()).updateVariantImage(any(), any(), any());
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void providerFailureDoesNotWriteAnImageUrlOrReportUploadSuccess(boolean variantUpload) {
        var previousProduct = product("https://media.example.test/a/original-product.png", 10);
        var previousVariant = variant("https://media.example.test/a/original-variant.png", 1000L);
        when(products.findByIdAndRestaurantId(productId, restaurantId)).thenReturn(Optional.of(previousProduct));
        when(variants.findByIdAndProductId(variantId, productId)).thenReturn(Optional.of(previousVariant));
        var failure = new ApiException(HttpStatus.BAD_GATEWAY, "MEDIA_STORAGE_OPERATION_FAILED",
                "error.media.storage-operation-failed");
        when(storage.uploadMenuImage(anyString(), anyString(), any(byte[].class))).thenThrow(failure);

        var result = assertThrows(ApiException.class, () -> {
            if (variantUpload) service.uploadVariantImage(restaurantId, productId, variantId, file());
            else service.uploadProductImage(restaurantId, productId, file());
        });

        assertSame(failure, result);
        assertEquals("https://media.example.test/a/original-product.png", previousProduct.getImageUrl());
        assertEquals("https://media.example.test/a/original-variant.png", previousVariant.getImageUrl());
        verify(products, never()).updateProductImage(any(), any(), any());
        verify(variants, never()).updateVariantImage(any(), any(), any());
        verify(products, never()).save(any());
        verify(variants, never()).save(any());
    }

    @Test
    void invalidImageContentCannotReachPrivilegedStorageOrDatabaseUpdate() {
        var invalid = new MockMultipartFile("file", "menu.png", "image/png", new byte[] {1, 2, 3});

        assertEquals("IMAGE_CONTENT_MISMATCH", assertThrows(ApiException.class,
                () -> service.uploadProductImage(restaurantId, productId, invalid)).getCode());

        verifyNoInteractions(storage);
        verify(products, never()).updateProductImage(any(), any(), any());
    }

    @ParameterizedTest
    @EnumSource(value = RestaurantRole.class, names = {"STAFF", "DELIVERY_DRIVER"})
    void operationalRolesCannotUploadImages(RestaurantRole role) {
        var member = new RestaurantMember();
        member.setRestaurantId(restaurantId); member.setUserId(ownerId); member.setRole(role);
        when(members.findByRestaurantIdAndUserId(restaurantId, ownerId)).thenReturn(Optional.of(member));

        assertEquals(HttpStatus.FORBIDDEN, assertThrows(ApiException.class,
                () -> service.uploadProductImage(restaurantId, productId, file())).getStatus());
        assertEquals(HttpStatus.FORBIDDEN, assertThrows(ApiException.class,
                () -> service.uploadVariantImage(restaurantId, productId, variantId, file())).getStatus());
        verifyNoInteractions(products, variants, storage);
    }

    @Test
    void managerRetainsScopedMediaUploadPermissionWithoutEditorialAuthority() {
        var manager = new RestaurantMember();
        manager.setRestaurantId(restaurantId); manager.setUserId(ownerId); manager.setRole(RestaurantRole.MANAGER);
        when(members.findByRestaurantIdAndUserId(restaurantId, ownerId)).thenReturn(Optional.of(manager));
        String url = "https://media.example.test/a/manager-upload.png";
        when(storage.uploadMenuImage(anyString(), eq("image/png"), any(byte[].class))).thenReturn(url);
        when(products.updateProductImage(productId, restaurantId, url)).thenReturn(1);
        when(products.findByIdAndRestaurantId(productId, restaurantId))
                .thenReturn(Optional.of(product(null, 10)), Optional.of(product(url, 10)));

        assertEquals(url, service.uploadProductImage(restaurantId, productId, file()).imageUrl());
        verify(products).updateProductImage(productId, restaurantId, url);
        verify(products, never()).save(any());
    }

    @Test
    void tenantAImageCannotReplaceTenantBProductOrAnUnrelatedVariant() {
        UUID restaurantB = UUID.randomUUID(), productB = UUID.randomUUID(), variantB = UUID.randomUUID();
        var existingB = product("https://media.example.test/b/original.png", 7);
        existingB.setId(productB); existingB.setRestaurantId(restaurantB);
        // Even a caller authorized for both restaurants cannot assign B's UUID through A's route.
        var memberB = new RestaurantMember();
        memberB.setRestaurantId(restaurantB); memberB.setUserId(ownerId); memberB.setRole(RestaurantRole.OWNER);
        when(members.findByRestaurantIdAndUserId(restaurantB, ownerId)).thenReturn(Optional.of(memberB));
        when(products.findByIdAndRestaurantId(productB, restaurantB)).thenReturn(Optional.of(existingB));

        assertEquals("PRODUCT_NOT_FOUND", assertThrows(ApiException.class,
                () -> service.uploadProductImage(restaurantId, productB, file())).getCode());
        assertEquals("PRODUCT_VARIANT_NOT_FOUND", assertThrows(ApiException.class,
                () -> service.uploadVariantImage(restaurantId, productId, variantB, file())).getCode());
        assertEquals("https://media.example.test/b/original.png", existingB.getImageUrl());
        verifyNoInteractions(storage);
        verify(products, never()).updateProductImage(any(), any(), any());
        verify(variants, never()).updateVariantImage(any(), any(), any());
    }

    @Test
    void sizeAndTypeFailuresCannotReachStorageOrReplaceThePublishedImage() {
        var existing = product("https://media.example.test/a/original.png", 10);
        when(products.findByIdAndRestaurantId(productId, restaurantId)).thenReturn(Optional.of(existing));
        var tooLarge = new MockMultipartFile("file", "large.png", "image/png", new byte[(int) CatalogImageService.MAX_IMAGE_BYTES + 1]);
        var unsupported = new MockMultipartFile("file", "menu.svg", "image/svg+xml", "<svg/>".getBytes(java.nio.charset.StandardCharsets.UTF_8));

        assertEquals("IMAGE_FILE_TOO_LARGE", assertThrows(ApiException.class,
                () -> service.uploadProductImage(restaurantId, productId, tooLarge)).getCode());
        assertEquals("UNSUPPORTED_IMAGE_TYPE", assertThrows(ApiException.class,
                () -> service.uploadVariantImage(restaurantId, productId, variantId, unsupported)).getCode());
        assertEquals("https://media.example.test/a/original.png", existing.getImageUrl());
        verifyNoInteractions(storage);
        verify(products, never()).updateProductImage(any(), any(), any());
        verify(variants, never()).updateVariantImage(any(), any(), any());
    }

    private MockMultipartFile file() {
        return new MockMultipartFile("file", "menu.png", "image/png", png);
    }

    private Product product(String imageUrl, int stock) {
        var result = new Product();
        result.setId(productId);
        result.setRestaurantId(restaurantId);
        result.setCategoryId(UUID.randomUUID());
        result.setName("Menu item");
        result.setPrice(1000L);
        result.setImageUrl(imageUrl);
        result.setTrackStock(true);
        result.setStockQuantity(stock);
        result.setIsAvailable(true);
        return result;
    }

    private ProductVariant variant(String imageUrl, long price) {
        var result = new ProductVariant();
        result.setId(variantId);
        result.setProductId(productId);
        result.setName("Large");
        result.setDescription("Suitable for sharing.");
        result.setPrice(price);
        result.setImageUrl(imageUrl);
        result.setIsAvailable(true);
        return result;
    }
}
