package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.menu.*;
import com.restaurant.platform.dto.platform.*;
import com.restaurant.platform.dto.platform.BootstrapStepRequest.*;
import com.restaurant.platform.entity.RestaurantBootstrapStep;
import com.restaurant.platform.repository.RestaurantBootstrapStepRepository;
import com.restaurant.platform.repository.RestaurantRepository;
import com.restaurant.platform.repository.RestaurantSettingsRepository;
import com.restaurant.platform.repository.OrderRepository;
import com.restaurant.platform.security.PlatformAdminAuthorization;
import jakarta.validation.Validator;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.MapperFeature;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.OffsetDateTime;
import java.util.*;

/** Small initial-setup ledger; domain writes and receipts commit together. No external writes. */
@Service
@RequiredArgsConstructor
public class PlatformRestaurantBootstrapService {
    private static final long MAX_SAFE_MONEY = 9007199254740991L;
    private static final Set<Kind> CATALOG_KINDS = EnumSet.of(Kind.CATEGORY, Kind.PRODUCT, Kind.VARIANT,
            Kind.MODIFIER_GROUP, Kind.MODIFIER_OPTION, Kind.ATTACH_MODIFIER_GROUP);
    private static final JsonMapper JSON = JsonMapper.builder()
            .disable(DeserializationFeature.ACCEPT_FLOAT_AS_INT)
            .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .disable(MapperFeature.ALLOW_COERCION_OF_SCALARS).build();
    private final PlatformAdminAuthorization authorization;
    private final RestaurantRepository restaurants;
    private final RestaurantSettingsRepository settings;
    private final RestaurantBootstrapStepRepository steps;
    private final CatalogManagementService catalog;
    private final PlatformRestaurantLifecycleService lifecycle;
    private final RestaurantBrandingService branding;
    private final Validator validator;
    private final RestaurantSettingsService orderingSettings;
    private final OrderRepository orders;

    /** Endpoint-specific strict decoder: fractional JSON can never be truncated into Long prices. */
    public BootstrapStepRequest parseRequest(String body) {
        authorization.requirePlatformAdmin();
        try { return JSON.readValue(body, BootstrapStepRequest.class); }
        catch (RuntimeException exception) { throw invalid(); }
    }

    @Transactional(readOnly = true)
    public RestaurantBootstrapResponse snapshot(UUID restaurantId) {
        authorization.requirePlatformAdmin();
        return snapshotAuthorized(restaurantId);
    }

    @Transactional
    public BootstrapStepResponse execute(UUID restaurantId, BootstrapStepRequest request) {
        UUID actor = authorization.requirePlatformAdmin();
        if (request == null || !validator.validate(request).isEmpty()) throw invalid();
        validateShape(request);
        // This is the same restaurant-row lock used by canonical palette initialization.
        restaurants.findActiveForBrandingUpdate(restaurantId).orElseThrow(() ->
                error(HttpStatus.NOT_FOUND, "RESTAURANT_NOT_FOUND"));
        String hash = hash(request);
        var prior = steps.findByRestaurantIdAndOperationKey(restaurantId, request.operationKey());
        if (prior.isPresent()) {
            if (!hash.equals(prior.get().getRequestHash())) throw conflict("BOOTSTRAP_KEY_REUSED");
            return response(prior.get());
        }
        // Bootstrap is initial setup, never an alternate catalog editor for a trading restaurant.
        if (orders.countByRestaurantId(restaurantId) > 0) throw conflict("BOOTSTRAP_RESTAURANT_IN_USE");
        List<RestaurantBootstrapStep> history = history(restaurantId);
        if (history.stream().anyMatch(step -> step.getKind() == Kind.HANDOFF)) {
            throw conflict("BOOTSTRAP_HANDED_OFF");
        }
        UUID resourceId = null;
        Map<String, Object> result = new LinkedHashMap<>();
        String currency = currency(restaurantId);
        switch (request.kind()) {
            case CATEGORY -> {
                if (catalog.bootstrapCategories(restaurantId).stream()
                        .anyMatch(row -> sameName(row.name(), request.category().name()))) throw duplicate();
                resourceId = catalog.createCategoryValidated(restaurantId, request.category()).id();
            }
            case PRODUCT -> {
                money(request.product().price(), request.currency(), currency);
                rejectImage(request.product().imageUrl());
                if (catalog.bootstrapProducts(restaurantId).stream().anyMatch(row ->
                        Objects.equals(row.categoryId(), request.product().categoryId())
                                && sameName(row.name(), request.product().name()))) throw duplicate();
                resourceId = catalog.createProductValidated(restaurantId, request.product()).id();
            }
            case VARIANT -> {
                money(request.variant().price(), request.currency(), currency);
                rejectImage(request.variant().imageUrl());
                if (catalog.bootstrapVariants(restaurantId).stream().anyMatch(row ->
                        Objects.equals(row.productId(), request.productId())
                                && sameName(row.name(), request.variant().name()))) throw duplicate();
                resourceId = catalog.createVariantValidated(restaurantId, request.productId(), request.variant()).id();
            }
            case MODIFIER_GROUP -> {
                if (catalog.bootstrapModifierGroups(restaurantId).stream()
                        .anyMatch(row -> sameName(row.name(), request.modifierGroup().name()))) throw duplicate();
                resourceId = catalog.createModifierGroupValidated(restaurantId, request.modifierGroup()).id();
            }
            case MODIFIER_OPTION -> {
                money(request.modifierOption().additionalPrice(), request.currency(), currency);
                if (catalog.bootstrapModifierGroups(restaurantId).stream()
                        .filter(row -> row.id().equals(request.modifierGroupId()))
                        .flatMap(row -> row.options().stream())
                        .anyMatch(row -> sameName(row.name(), request.modifierOption().name()))) throw duplicate();
                resourceId = catalog.createModifierOptionValidated(restaurantId, request.modifierGroupId(),
                        request.modifierOption()).id();
            }
            case ATTACH_MODIFIER_GROUP -> {
                catalog.attachModifierGroupValidated(restaurantId, request.productId(), request.modifierGroupId());
                result.put("productId", request.productId().toString());
                result.put("modifierGroupId", request.modifierGroupId().toString());
            }
            case MEDIA_MANIFEST -> {
                String latestMediaOperationKey = history.stream().filter(step -> step.getKind() == Kind.MEDIA_MANIFEST)
                        .reduce((earlier, later) -> later).map(RestaurantBootstrapStep::getOperationKey).orElse(null);
                if (!Objects.equals(request.expectedMediaOperationKey(), latestMediaOperationKey)) {
                    throw conflict("BOOTSTRAP_MEDIA_MANIFEST_STALE");
                }
                validateMedia(restaurantId, request.mediaManifest());
                result.put("mediaManifest", JSON.convertValue(request.mediaManifest(), List.class));
                result.put("uploadStatus", "PENDING");
            }
            case ORDERING_SETTINGS -> {
                var currentSettings = orderingSettings.bootstrapSettings(restaurantId);
                if (!currentSettings.currency().equals(request.settings().currency())
                        || !currentSettings.timezone().equals(request.settings().timezone())) throw invalid();
                money(request.settings().minimumOrder(), request.settings().currency(), currency);
                money(request.settings().defaultDeliveryFee(), request.settings().currency(), currency);
                orderingSettings.updateSettingsValidated(restaurantId, request.settings());
                result.put("status", "ORDERING_SETTINGS_REVIEWED");
                result.put("settingsFingerprint", hashValue(orderingSettings.bootstrapSettings(restaurantId)));
            }
            case COMPLETE_CATALOG -> {
                validateCompleteCatalog(restaurantId);
                result.put("status", "REVIEWED");
                result.put("catalogFingerprint", catalogFingerprint(restaurantId));
            }
            case HANDOFF -> {
                if (!snapshotAuthorized(restaurantId).handoffReady()) throw conflict("BOOTSTRAP_HANDOFF_BLOCKED");
                result.put("status", "OPERATIONS_HANDED_OFF");
                result.put("publicationStatus", "PENDING");
            }
        }
        if (resourceId != null) result.put("id", resourceId.toString());
        RestaurantBootstrapStep receipt = new RestaurantBootstrapStep();
        receipt.setId(UUID.randomUUID());
        receipt.setRestaurantId(restaurantId);
        receipt.setOperationKey(request.operationKey());
        receipt.setKind(request.kind());
        receipt.setRequestHash(hash);
        receipt.setResourceId(resourceId);
        receipt.setResult(result);
        receipt.setActorId(actor);
        receipt.setCompletedAt(OffsetDateTime.now());
        receipt.setStepIndex(history.stream().mapToLong(RestaurantBootstrapStep::getStepIndex).max().orElse(0) + 1);
        // Flush discovers schema/constraint failures before any success is returned.
        return response(steps.saveAndFlush(receipt));
    }

    private RestaurantBootstrapResponse snapshotAuthorized(UUID id) {
        var detail = lifecycle.getDetail(id);
        var brand = branding.getPlatformBranding(id);
        var history = history(id);
        var products = catalog.bootstrapProducts(id);
        var groups = catalog.bootstrapModifierGroups(id);
        var associations = products.stream().flatMap(product ->
                catalog.bootstrapProductModifierGroupIds(id, product.id()).stream()
                        .map(groupId -> new RestaurantBootstrapResponse.ProductModifierGroup(product.id(), groupId)))
                .toList();
        boolean complete = false;
        boolean handedOff = false;
        String reviewedCatalog = null;
        String reviewedSettings = null;
        List<MediaEntry> manifest = List.of();
        for (var step : history) {
            if (CATALOG_KINDS.contains(step.getKind())) complete = false;
            if (step.getKind() == Kind.COMPLETE_CATALOG) {
                complete = true;
                reviewedCatalog = (String) step.getResult().get("catalogFingerprint");
            }
            if (step.getKind() == Kind.ORDERING_SETTINGS) {
                reviewedSettings = (String) step.getResult().get("settingsFingerprint");
            }
            if (step.getKind() == Kind.HANDOFF) handedOff = true;
            if (step.getKind() == Kind.MEDIA_MANIFEST) {
                Object raw = step.getResult().get("mediaManifest");
                manifest = raw instanceof List<?> entries
                        ? entries.stream().map(entry -> JSON.convertValue(entry, MediaEntry.class)).toList() : List.of();
            }
        }
        if (complete && !handedOff) complete = Objects.equals(reviewedCatalog, catalogFingerprint(id));
        var currentSettings = orderingSettings.bootstrapSettings(id);
        boolean ownerConfirmed = !detail.owners().isEmpty() && detail.owners().stream().allMatch(owner ->
                "ACCEPTED".equals(owner.invitationStatus()) && "COMPLETE".equals(owner.onboardingStatus())
                        && owner.onboardingCompletedAt() != null);
        List<String> blockers = new ArrayList<>();
        if (!detail.restaurant().active()) blockers.add("RESTAURANT_INACTIVE");
        if (!ownerConfirmed) blockers.add("OWNER_ACCOUNT_SETUP_PENDING");
        if (brand.palette() == null || brand.revision() == 0) blockers.add("RUNTIME_PALETTE_PENDING");
        if (!complete) blockers.add("CATALOG_REVIEW_PENDING");
        if (!handedOff && !Objects.equals(reviewedSettings, hashValue(currentSettings))) {
            blockers.add("ORDERING_SETTINGS_REVIEW_PENDING");
        }
        if (!handedOff && detail.orderCount() > 0) blockers.add("RESTAURANT_IN_USE");
        return new RestaurantBootstrapResponse(id, detail.currency(), history.stream().map(this::response).toList(),
                catalog.bootstrapCategories(id), products, catalog.bootstrapVariants(id), groups, associations,
                complete, manifest, brand, detail.owners(), ownerConfirmed, "PENDING", "PENDING",
                blockers.isEmpty() && !handedOff, handedOff, blockers, currentSettings);
    }

    private void validateCompleteCatalog(UUID id) {
        if (catalog.bootstrapCategories(id).isEmpty() || catalog.bootstrapProducts(id).isEmpty()) {
            throw conflict("BOOTSTRAP_CATALOG_EMPTY");
        }
        // A required group cannot be approved while it is impossible to select its minimum.
        for (var group : catalog.bootstrapModifierGroups(id)) {
            if (group.active() && group.minSelections() > 0
                    && group.options().stream().filter(ModifierOptionResponse::available).count() < group.minSelections()) {
                throw conflict("BOOTSTRAP_REQUIRED_MODIFIERS_INCOMPLETE");
            }
        }
    }

    private void validateMedia(UUID id, List<MediaEntry> entries) {
        Set<String> filenames = new HashSet<>();
        Set<String> targets = new HashSet<>();
        for (var entry : entries) {
            if (!id.equals(entry.restaurantId()) || entry.originalFilename().isBlank()
                    || !entry.originalFilename().equals(entry.originalFilename().trim())
                    || entry.originalFilename().equals(".") || entry.originalFilename().equals("..")
                    || entry.originalFilename().endsWith(".")
                    || entry.originalFilename().contains("/") || entry.originalFilename().contains("\\")
                    || entry.originalFilename().contains(":" ) || entry.originalFilename().chars().anyMatch(c -> c < 32)
                    || entry.originalFilename().chars().anyMatch(c -> "<>\"|?*".indexOf(c) >= 0)
                    || !filenames.add(entry.originalFilename().trim().toLowerCase(Locale.ROOT))) throw invalid();
            // A reviewed mapping identifies observed source bytes, but still cannot certify a Storage upload.
            if (entry.reviewStatus() == ReviewStatus.APPROVED && entry.originalContentHash() == null) throw invalid();
            if (entry.productId() == null) {
                if (entry.reviewStatus() != ReviewStatus.PENDING || entry.variantId() != null) throw invalid();
            } else {
                if (entry.intendedAssociation() == Association.PRODUCT_IMAGE && entry.variantId() != null
                        || entry.intendedAssociation() == Association.VARIANT_IMAGE && entry.variantId() == null
                        && entry.reviewStatus() != ReviewStatus.PENDING) throw invalid();
                catalog.validateBootstrapMediaReference(id, entry.productId(), entry.variantId());
                if (!targets.add(entry.productId() + ":" + entry.variantId())) throw invalid();
            }
        }
    }

    /** Reject unrelated payload fields so a receipt cannot imply an operation was performed. */
    private void validateShape(BootstrapStepRequest r) {
        boolean category = r.kind() == Kind.CATEGORY;
        boolean product = r.kind() == Kind.PRODUCT;
        boolean variant = r.kind() == Kind.VARIANT;
        boolean group = r.kind() == Kind.MODIFIER_GROUP;
        boolean option = r.kind() == Kind.MODIFIER_OPTION;
        boolean attach = r.kind() == Kind.ATTACH_MODIFIER_GROUP;
        boolean media = r.kind() == Kind.MEDIA_MANIFEST;
        boolean ordering = r.kind() == Kind.ORDERING_SETTINGS;
        if (category != (r.category() != null) || product != (r.product() != null)
                || variant != (r.variant() != null) || group != (r.modifierGroup() != null)
                || option != (r.modifierOption() != null) || media != (r.mediaManifest() != null)
                || (variant || attach) != (r.productId() != null)
                || (option || attach) != (r.modifierGroupId() != null)
                || (product || variant || option) != (r.currency() != null)
                || ordering != (r.settings() != null)
                || !media && r.expectedMediaOperationKey() != null) throw invalid();
    }

    private String currency(UUID id) {
        return settings.findById(id).orElseThrow(() -> error(HttpStatus.NOT_FOUND, "RESTAURANT_SETTINGS_NOT_FOUND"))
                .getCurrency();
    }
    private void money(Long value, String suppliedCurrency, String actualCurrency) {
        if (value == null || value < 0 || value > MAX_SAFE_MONEY
                || !Objects.equals(suppliedCurrency, actualCurrency)) throw invalid();
    }
    private void rejectImage(String imageUrl) {
        if (imageUrl != null && !imageUrl.isBlank()) throw error(HttpStatus.FORBIDDEN, "BOOTSTRAP_MEDIA_UPLOAD_NOT_AUTHORIZED");
    }
    private boolean sameName(String a, String b) {
        return a != null && b != null && a.trim().equalsIgnoreCase(b.trim());
    }
    private List<RestaurantBootstrapStep> history(UUID id) {
        return steps.findByRestaurantIdOrderByCompletedAtAscIdAsc(id);
    }
    private BootstrapStepResponse response(RestaurantBootstrapStep step) {
        return new BootstrapStepResponse(step.getOperationKey(), step.getKind(), step.getResourceId(),
                step.getResult(), step.getActorId(), step.getCompletedAt());
    }
    private String hash(BootstrapStepRequest request) {
        return hashValue(request);
    }

    private String hashValue(Object value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(JSON.writeValueAsString(value).getBytes(StandardCharsets.UTF_8)));
        } catch (Exception exception) { throw new IllegalStateException("Cannot hash bootstrap request", exception); }
    }

    /** Review refers to exact live tenant data, even when an Owner edits through existing APIs. */
    private String catalogFingerprint(UUID id) {
        var categories = catalog.bootstrapCategories(id).stream().sorted(Comparator.comparing(CategoryResponse::id)).toList();
        var rows = catalog.bootstrapProducts(id).stream().sorted(Comparator.comparing(ProductManagementResponse::id)).toList();
        var products = rows.stream().map(product -> Arrays.asList(product.id(), product.categoryId(), product.name(),
                product.description(), product.price(), product.imageUrl(), product.trackStock(), product.stockQuantity(),
                product.available())).toList();
        var variants = catalog.bootstrapVariants(id).stream().sorted(Comparator.comparing(ProductVariantResponse::id))
                .map(variant -> Arrays.asList(variant.id(), variant.productId(), variant.name(), variant.description(),
                        variant.price(), variant.imageUrl(), variant.available())).toList();
        var groups = catalog.bootstrapModifierGroups(id).stream().sorted(Comparator.comparing(ModifierGroupResponse::id))
                .map(group -> new ModifierGroupResponse(group.id(), group.name(), group.required(), group.minSelections(),
                        group.maxSelections(), group.active(), group.options().stream()
                                .sorted(Comparator.comparing(ModifierOptionResponse::id)).toList())).toList();
        var links = rows.stream().flatMap(product -> catalog.bootstrapProductModifierGroupIds(id, product.id()).stream()
                .sorted().map(group -> product.id() + ":" + group)).toList();
        return hashValue(List.of(currency(id), categories, products, variants, groups, links));
    }
    private ApiException invalid() { return error(HttpStatus.BAD_REQUEST, "INVALID_BOOTSTRAP_STEP"); }
    private ApiException duplicate() { return conflict("BOOTSTRAP_RECORD_EXISTS"); }
    private ApiException conflict(String code) { return error(HttpStatus.CONFLICT, code); }
    private ApiException error(HttpStatus status, String code) {
        return new ApiException(status, code, "error.platform-admin.bootstrap");
    }
}
