package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.menu.*;
import com.restaurant.platform.dto.platform.*;
import com.restaurant.platform.dto.platform.BootstrapStepRequest.*;
import com.restaurant.platform.entity.*;
import com.restaurant.platform.repository.*;
import com.restaurant.platform.security.PlatformAdminAuthorization;
import jakarta.validation.Validation;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class PlatformRestaurantBootstrapServiceTest {
    final UUID restaurantId = UUID.randomUUID();
    final UUID actor = UUID.randomUUID();
    final UUID categoryId = UUID.randomUUID();
    final PlatformAdminAuthorization authorization = mock(PlatformAdminAuthorization.class);
    final RestaurantRepository restaurants = mock(RestaurantRepository.class);
    final RestaurantSettingsRepository settings = mock(RestaurantSettingsRepository.class);
    final RestaurantBootstrapStepRepository receipts = mock(RestaurantBootstrapStepRepository.class);
    final CatalogManagementService catalog = mock(CatalogManagementService.class);
    final PlatformRestaurantLifecycleService lifecycle = mock(PlatformRestaurantLifecycleService.class);
    final RestaurantBrandingService branding = mock(RestaurantBrandingService.class);
    final RestaurantSettingsService ordering = mock(RestaurantSettingsService.class);
    final OrderRepository orders = mock(OrderRepository.class);
    PlatformRestaurantBootstrapService service;

    @BeforeEach void setup() {
        service = new PlatformRestaurantBootstrapService(authorization, restaurants, settings, receipts, catalog,
                lifecycle, branding, Validation.buildDefaultValidatorFactory().getValidator(), ordering, orders);
        when(authorization.requirePlatformAdmin()).thenReturn(actor);
        when(restaurants.findActiveForBrandingUpdate(restaurantId)).thenReturn(Optional.of(new Restaurant()));
        var row = new RestaurantSettings(); row.setRestaurantId(restaurantId); row.setCurrency("MMK");
        when(settings.findById(restaurantId)).thenReturn(Optional.of(row));
        when(receipts.saveAndFlush(any())).thenAnswer(call -> call.getArgument(0));
        when(catalog.createCategoryValidated(any(), any())).thenReturn(new CategoryResponse(categoryId,"Tea",0,true));
    }

    BootstrapStepRequest parse(String key, String fields) {
        return service.parseRequest("{\"operationKey\":\"" + key + "\"," + fields + "}");
    }
    BootstrapStepRequest category(String key, String name) {
        return parse(key, "\"kind\":\"CATEGORY\",\"category\":{\"name\":\"" + name + "\",\"displayOrder\":0,\"active\":true}");
    }
    ApiException rejected(Runnable work, String code) {
        var failure = assertThrows(ApiException.class, work::run); assertEquals(code, failure.getCode()); return failure;
    }

    @Test void authorizationPrecedesAnyTenantReadOrDecoder() {
        doThrow(new ApiException(HttpStatus.FORBIDDEN,"PLATFORM_ADMIN_REQUIRED","denied"))
                .when(authorization).requirePlatformAdmin();
        rejected(() -> service.snapshot(restaurantId), "PLATFORM_ADMIN_REQUIRED");
        rejected(() -> service.parseRequest("{}"), "PLATFORM_ADMIN_REQUIRED");
        verifyNoInteractions(restaurants, settings, receipts, catalog);
    }

    @Test void missingTenantCannotCreateAnything() {
        when(restaurants.findActiveForBrandingUpdate(restaurantId)).thenReturn(Optional.empty());
        rejected(() -> service.execute(restaurantId,category("tea","Tea")), "RESTAURANT_NOT_FOUND");
        verifyNoInteractions(catalog, receipts);
    }

    @Test void receiptUsesTrustedActorAndReturnedIdAndReplaysWithoutSecondWrite() {
        var request = category("tea","Tea");
        var first = service.execute(restaurantId, request);
        assertEquals(actor, first.actorId()); assertEquals(categoryId, first.resourceId());
        var saved = org.mockito.ArgumentCaptor.forClass(RestaurantBootstrapStep.class);
        verify(receipts).saveAndFlush(saved.capture());
        when(receipts.findByRestaurantIdAndOperationKey(restaurantId,"tea")).thenReturn(Optional.of(saved.getValue()));
        when(orders.countByRestaurantId(restaurantId)).thenReturn(1L);
        assertEquals(first, service.execute(restaurantId, request));
        verify(catalog,times(1)).createCategoryValidated(any(),any());
        rejected(() -> service.execute(restaurantId,category("tea","Changed")), "BOOTSTRAP_KEY_REUSED");
    }

    @Test void secondKeyDoesNotDuplicateCategory() {
        when(catalog.bootstrapCategories(restaurantId)).thenReturn(List.of(new CategoryResponse(categoryId," Tea ",0,true)));
        rejected(() -> service.execute(restaurantId,category("new-key","tea")), "BOOTSTRAP_RECORD_EXISTS");
        verify(catalog,never()).createCategoryValidated(any(),any());
        verify(receipts,never()).saveAndFlush(any());
    }

    @Test void failedDomainStepHasNoSuccessReceiptAndCanRetrySameKey() {
        var request = category("retry","Tea");
        when(catalog.createCategoryValidated(any(),any())).thenThrow(new ApiException(HttpStatus.BAD_REQUEST,"FIXTURE_FAILURE","failed"))
                .thenReturn(new CategoryResponse(categoryId,"Tea",0,true));
        rejected(() -> service.execute(restaurantId,request), "FIXTURE_FAILURE");
        verify(receipts,never()).saveAndFlush(any());
        assertEquals(categoryId, service.execute(restaurantId,request).resourceId());
    }

    @Test void allNewWritesCloseAfterHandoff() {
        var closed = new RestaurantBootstrapStep(); closed.setKind(Kind.HANDOFF);
        when(receipts.findByRestaurantIdOrderByCompletedAtAscIdAsc(restaurantId)).thenReturn(List.of(closed));
        rejected(() -> service.execute(restaurantId,category("after","Tea")), "BOOTSTRAP_HANDED_OFF");
        verifyNoInteractions(catalog);
    }

    @Test void tradingRestaurantCannotUseBootstrapAsGeneralCatalogEditor() {
        when(orders.countByRestaurantId(restaurantId)).thenReturn(1L);
        rejected(() -> service.execute(restaurantId,category("in-use","Tea")), "BOOTSTRAP_RESTAURANT_IN_USE");
        verifyNoInteractions(catalog);
        verify(receipts,never()).saveAndFlush(any());
    }

    @Test void orderingReviewCannotChangeProvisionedCurrencyTimezoneOrUseFractionalAmounts() {
        when(ordering.bootstrapSettings(restaurantId)).thenReturn(
                new com.restaurant.platform.dto.settings.RestaurantSettingsResponse(
                        restaurantId,"MMK","Asia/Yangon",0,0,true,true,true,true,null));
        for (String value : List.of("\"currency\":\"THB\",\"timezone\":\"Asia/Yangon\"",
                "\"currency\":\"MMK\",\"timezone\":\"Asia/Bangkok\"")) {
            var request = parse("ordering", "\"kind\":\"ORDERING_SETTINGS\",\"settings\":{"+value
                    +",\"minimumOrder\":0,\"defaultDeliveryFee\":0,\"acceptsOrders\":true,\"allowQrOrder\":true,\"allowDelivery\":true,\"allowTakeaway\":true}");
            rejected(() -> service.execute(restaurantId,request),"INVALID_BOOTSTRAP_STEP");
        }
        rejected(() -> parse("ordering", "\"kind\":\"ORDERING_SETTINGS\",\"settings\":{\"currency\":\"MMK\",\"timezone\":\"Asia/Yangon\",\"minimumOrder\":0.5,\"defaultDeliveryFee\":0,\"acceptsOrders\":true,\"allowQrOrder\":true,\"allowDelivery\":true,\"allowTakeaway\":true}"), "INVALID_BOOTSTRAP_STEP");
        verify(ordering,never()).updateSettingsValidated(any(),any());
    }

    @Test void strictDecoderRejectsFractionalMoneyScalarCoercionAndUnknownCredentials() {
        for (String extra : List.of("1.5", "\"1000\"", "9007199254740992.5")) {
            rejected(() -> parse("fraction","\"kind\":\"VARIANT\",\"currency\":\"MMK\",\"productId\":\""+categoryId+"\",\"variant\":{\"name\":\"Small\",\"price\":"+extra+",\"available\":true}"), "INVALID_BOOTSTRAP_STEP");
        }
        rejected(() -> parse("secret","\"kind\":\"HANDOFF\",\"serviceRoleKey\":\"not-allowed\""), "INVALID_BOOTSTRAP_STEP");
    }

    @Test void invalidMoneyCurrencyAndMediaInjectionHaveNoReceipt() {
        for(String value : List.of("-1","9007199254740992")) {
            var request = parse("money","\"kind\":\"VARIANT\",\"currency\":\"MMK\",\"productId\":\""+categoryId+"\",\"variant\":{\"name\":\"Small\",\"price\":"+value+",\"available\":true}");
            rejected(() -> service.execute(restaurantId,request), "INVALID_BOOTSTRAP_STEP");
        }
        var foreignCurrency = parse("currency","\"kind\":\"VARIANT\",\"currency\":\"THB\",\"productId\":\""+categoryId+"\",\"variant\":{\"name\":\"Small\",\"price\":100,\"available\":true}");
        rejected(() -> service.execute(restaurantId,foreignCurrency), "INVALID_BOOTSTRAP_STEP");
        var image = parse("image","\"kind\":\"VARIANT\",\"currency\":\"MMK\",\"productId\":\""+categoryId+"\",\"variant\":{\"name\":\"Small\",\"price\":100,\"available\":true,\"imageUrl\":\"https://example.test/injected.jpg\"}");
        rejected(() -> service.execute(restaurantId,image), "BOOTSTRAP_MEDIA_UPLOAD_NOT_AUTHORIZED");
        verify(receipts,never()).saveAndFlush(any());
    }

    @Test void unrelatedPayloadFieldsAreRejected() {
        var request = parse("shape","\"kind\":\"HANDOFF\",\"category\":{\"name\":\"Unused\"}");
        rejected(() -> service.execute(restaurantId,request), "INVALID_BOOTSTRAP_STEP");
        var unrelatedMediaBase = parse("shape", "\"kind\":\"HANDOFF\",\"expectedMediaOperationKey\":\"other-manifest\"");
        rejected(() -> service.execute(restaurantId,unrelatedMediaBase), "INVALID_BOOTSTRAP_STEP");
    }

    String media(UUID tenant,String product,String variant,String association,String review,String filename) {
        return "\"kind\":\"MEDIA_MANIFEST\",\"mediaManifest\":[{\"originalFilename\":\""+filename+"\",\"restaurantId\":\""+tenant+"\",\"productId\":"+product+",\"variantId\":"+variant+",\"intendedAssociation\":\""+association+"\",\"reviewStatus\":\""+review+"\",\"uploadStatus\":\"PENDING\"}]";
    }

    @Test void pendingOriginalMappingIsTruthfulAndPersistedWithoutUpload() {
        var result = service.execute(restaurantId,parse("manifest",media(restaurantId,"null","null","PRODUCT_IMAGE","PENDING","approved.jpg")));
        assertNull(result.resourceId()); assertEquals("PENDING",result.result().get("uploadStatus"));
        verify(catalog,never()).validateBootstrapMediaReference(any(),any(),any());
    }

    @Test void staleMediaReviewCannotEraseAnotherTabAndExactReplayKeepsItsOriginalReceipt() {
        var firstRequest = parse("media.first", media(restaurantId,"null","null","PRODUCT_IMAGE","PENDING","first.jpg"));
        var first = service.execute(restaurantId, firstRequest);
        var saved = org.mockito.ArgumentCaptor.forClass(RestaurantBootstrapStep.class);
        verify(receipts).saveAndFlush(saved.capture());
        var firstReceipt = saved.getValue();
        when(receipts.findByRestaurantIdOrderByCompletedAtAscIdAsc(restaurantId)).thenReturn(List.of(firstReceipt));

        var staleTab = parse("media.stale", media(restaurantId,"null","null","PRODUCT_IMAGE","PENDING","stale.jpg"));
        rejected(() -> service.execute(restaurantId, staleTab), "BOOTSTRAP_MEDIA_MANIFEST_STALE");
        verify(receipts,times(1)).saveAndFlush(any());

        var freshReview = parse("media.next", media(restaurantId,"null","null","PRODUCT_IMAGE","PENDING","reviewed.jpg")
                + ",\"expectedMediaOperationKey\":\"media.first\"");
        service.execute(restaurantId, freshReview);
        verify(receipts,times(2)).saveAndFlush(saved.capture());
        var latestReceipt = saved.getAllValues().getLast();
        when(receipts.findByRestaurantIdOrderByCompletedAtAscIdAsc(restaurantId))
                .thenReturn(List.of(firstReceipt, latestReceipt));
        when(receipts.findByRestaurantIdAndOperationKey(restaurantId,"media.first"))
                .thenReturn(Optional.of(firstReceipt));
        assertEquals(first, service.execute(restaurantId, firstRequest));
        verify(receipts,times(2)).saveAndFlush(any());
    }

    @Test void nullableMediaCheckpointPreservesLegacyReceiptHashes() throws Exception {
        var mapper = tools.jackson.databind.json.JsonMapper.builder().build();
        for (var request : List.of(category("legacy.category", "Tea"),
                parse("legacy.media", media(restaurantId,"null","null","PRODUCT_IMAGE","PENDING","original.jpg")))) {
            var legacy = new LegacyBootstrapRequest(request.operationKey(), request.kind(), request.currency(),
                    request.category(), request.product(), request.productId(), request.variant(), request.modifierGroup(),
                    request.modifierGroupId(), request.modifierOption(), request.mediaManifest(), request.settings());
            var oldHash = HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256")
                    .digest(mapper.writeValueAsBytes(legacy)));
            var oldReceipt = new RestaurantBootstrapStep();
            oldReceipt.setOperationKey(request.operationKey()); oldReceipt.setKind(request.kind());
            oldReceipt.setRequestHash(oldHash); oldReceipt.setActorId(actor);
            oldReceipt.setCompletedAt(java.time.OffsetDateTime.now()); oldReceipt.setResult(Map.of("status", "LEGACY_RECEIPT"));
            when(receipts.findByRestaurantIdAndOperationKey(restaurantId, request.operationKey()))
                    .thenReturn(Optional.of(oldReceipt));
            var retry = new BootstrapStepRequest(request.operationKey(), request.kind(), request.currency(),
                    request.category(), request.product(), request.productId(), request.variant(), request.modifierGroup(),
                    request.modifierGroupId(), request.modifierOption(), request.mediaManifest(), request.settings());
            assertEquals(new BootstrapStepResponse(oldReceipt.getOperationKey(), oldReceipt.getKind(), null,
                    oldReceipt.getResult(), actor, oldReceipt.getCompletedAt()), service.execute(restaurantId, retry));
            assertFalse(mapper.writeValueAsString(retry).contains("expectedMediaOperationKey"));
        }
        verifyNoInteractions(catalog, settings, ordering, orders);
        verify(receipts,never()).saveAndFlush(any());
    }

    private record LegacyBootstrapRequest(String operationKey, Kind kind, String currency, CategoryRequest category,
            ProductRequest product, UUID productId, ProductVariantRequest variant, ModifierGroupRequest modifierGroup,
            UUID modifierGroupId, ModifierOptionRequest modifierOption, List<MediaEntry> mediaManifest,
            com.restaurant.platform.dto.settings.RestaurantSettingsRequest settings) { }

    @Test void invalidManifestMappingsAndFilenamesFail() {
        for(String fields : List.of(
                media(UUID.randomUUID(),"null","null","PRODUCT_IMAGE","PENDING","photo.jpg"),
                media(restaurantId,"null","null","PRODUCT_IMAGE","APPROVED","photo.jpg"),
                media(restaurantId,"null","null","PRODUCT_IMAGE","PENDING","../photo.jpg"),
                media(restaurantId,"\""+categoryId+"\"","null","VARIANT_IMAGE","APPROVED","photo.jpg"))) {
            rejected(() -> service.execute(restaurantId,parse("bad-media",fields)), "INVALID_BOOTSTRAP_STEP");
        }
        verify(receipts,never()).saveAndFlush(any());
    }

    @Test void foreignMediaReferenceUsesDomainOwnershipValidation() {
        doThrow(new ApiException(HttpStatus.NOT_FOUND,"PRODUCT_NOT_FOUND","missing"))
                .when(catalog).validateBootstrapMediaReference(restaurantId,categoryId,null);
        rejected(() -> service.execute(restaurantId,parse("foreign-media",withHash(media(restaurantId,"\""+categoryId+"\"","null","PRODUCT_IMAGE","APPROVED","photo.jpg"), "a".repeat(64)))), "PRODUCT_NOT_FOUND");
        verify(receipts,never()).saveAndFlush(any());
    }

    private String withHash(String fields, String hash) {
        return fields.replace("\"uploadStatus\":", "\"originalContentHash\":\"" + hash + "\",\"uploadStatus\":");
    }

    @Test void approvalRequiresAnObservedWellFormedHashAndSafeOriginalFilename() {
        var approved = media(restaurantId, "\"" + categoryId + "\"", "null", "PRODUCT_IMAGE", "APPROVED", "source.jpg");
        rejected(() -> service.execute(restaurantId, parse("missing-hash", approved)), "INVALID_BOOTSTRAP_STEP");
        for (String hash : List.of("", "not-sha256", "g".repeat(64), "a".repeat(63))) {
            rejected(() -> service.execute(restaurantId, parse("invalid-hash", withHash(approved, hash))), "INVALID_BOOTSTRAP_STEP");
        }
        for (String filename : List.of(".", "..", "source.jpg.", " source.jpg", "source.jpg ", "source?.jpg", "source|.jpg")) {
            var fields = withHash(media(restaurantId, "\"" + categoryId + "\"", "null", "PRODUCT_IMAGE", "APPROVED", filename), "a".repeat(64));
            rejected(() -> service.execute(restaurantId, parse("unsafe-name", fields)), "INVALID_BOOTSTRAP_STEP");
        }
        verify(receipts, never()).saveAndFlush(any());
    }

    @Test void reviewedProductAndVariantMappingsRemainPendingPublicationAndUseActualUuidValidation() {
        UUID variant = UUID.randomUUID();
        var fields = withHash(media(restaurantId, "\"" + categoryId + "\"", "\"" + variant + "\"", "VARIANT_IMAGE", "APPROVED", "variant.webp"), "b".repeat(64));
        var result = service.execute(restaurantId, parse("reviewed-variant", fields));
        assertEquals("PENDING", result.result().get("uploadStatus"));
        assertNull(result.resourceId());
        verify(catalog).validateBootstrapMediaReference(restaurantId, categoryId, variant);
        verify(catalog, never()).createProductValidated(any(), any());
        verify(catalog, never()).createVariantValidated(any(), any(), any());
    }

    @Test void unknownProductCannotBecomeAnApprovedMappingOrProduceASuccessReceipt() {
        UUID unknown = UUID.randomUUID();
        doThrow(new ApiException(HttpStatus.NOT_FOUND, "PRODUCT_NOT_FOUND", "missing"))
                .when(catalog).validateBootstrapMediaReference(restaurantId, unknown, null);
        var fields = withHash(media(restaurantId, "\"" + unknown + "\"", "null", "PRODUCT_IMAGE", "APPROVED", "unknown.jpg"), "c".repeat(64));
        rejected(() -> service.execute(restaurantId, parse("unknown-product", fields)), "PRODUCT_NOT_FOUND");
        verify(receipts, never()).saveAndFlush(any());
    }

    @Test void legacyApprovedManifestReceiptStillReplaysBeforeNewHashRequirement() {
        var request = parse("legacy.approved", media(restaurantId, "\"" + categoryId + "\"", "null", "PRODUCT_IMAGE", "APPROVED", "original.jpg"));
        var mapper = tools.jackson.databind.json.JsonMapper.builder().build();
        try {
            String hash = HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256")
                    .digest(mapper.writeValueAsBytes(request)));
            var prior = new RestaurantBootstrapStep();
            prior.setOperationKey(request.operationKey()); prior.setKind(Kind.MEDIA_MANIFEST);
            prior.setRequestHash(hash); prior.setActorId(actor); prior.setResult(Map.of("uploadStatus", "PENDING"));
            when(receipts.findByRestaurantIdAndOperationKey(restaurantId, request.operationKey())).thenReturn(Optional.of(prior));
            assertEquals("PENDING", service.execute(restaurantId, request).result().get("uploadStatus"));
        } catch (java.security.NoSuchAlgorithmException exception) {
            throw new AssertionError(exception);
        }
        verifyNoInteractions(catalog, settings, ordering, orders);
        verify(receipts, never()).saveAndFlush(any());
    }

    @Test void uploadVerificationCannotBeClaimedInManifest() {
        rejected(() -> parse("fake-upload",media(restaurantId,"null","null","PRODUCT_IMAGE","PENDING","photo.jpg").replace("PENDING\"}]", "VERIFIED\"}]")), "INVALID_BOOTSTRAP_STEP");
    }

    @Test void incompleteRequiredModifiersBlockCatalogReview() {
        when(catalog.bootstrapCategories(restaurantId)).thenReturn(List.of(new CategoryResponse(categoryId,"Food",0,true)));
        when(catalog.bootstrapProducts(restaurantId)).thenReturn(List.of(mock(ProductManagementResponse.class)));
        when(catalog.bootstrapModifierGroups(restaurantId)).thenReturn(List.of(new ModifierGroupResponse(categoryId,"Size",true,1,1,true,List.of())));
        rejected(() -> service.execute(restaurantId,parse("review","\"kind\":\"COMPLETE_CATALOG\"")), "BOOTSTRAP_REQUIRED_MODIFIERS_INCOMPLETE");
        verify(receipts,never()).saveAndFlush(any());
    }
}
