package com.restaurant.platform.dto.platform;

import com.restaurant.platform.dto.menu.*;
import com.restaurant.platform.dto.settings.RestaurantSettingsRequest;
import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.List;
import java.util.UUID;

/** One reviewed, keyed operation. No actor, role, upload URL or membership is accepted. */
public record BootstrapStepRequest(
        @NotBlank @Pattern(regexp = "[A-Za-z0-9][A-Za-z0-9._:-]{0,99}") String operationKey,
        @NotNull Kind kind,
        @Pattern(regexp = "[A-Z]{3}") String currency,
        @Valid CategoryRequest category,
        @Valid ProductRequest product,
        UUID productId,
        @Valid ProductVariantRequest variant,
        @Valid ModifierGroupRequest modifierGroup,
        UUID modifierGroupId,
        @Valid ModifierOptionRequest modifierOption,
        @Size(max = 500) List<@NotNull @Valid MediaEntry> mediaManifest,
        @Valid RestaurantSettingsRequest settings,
        @JsonInclude(JsonInclude.Include.NON_NULL)
        @Pattern(regexp = "[A-Za-z0-9][A-Za-z0-9._:-]{0,99}") String expectedMediaOperationKey) {
    /** Existing non-media callers retain the same serialized request and receipt hash. */
    public BootstrapStepRequest(String operationKey, Kind kind, String currency, CategoryRequest category,
            ProductRequest product, UUID productId, ProductVariantRequest variant, ModifierGroupRequest modifierGroup,
            UUID modifierGroupId, ModifierOptionRequest modifierOption, List<MediaEntry> mediaManifest,
            RestaurantSettingsRequest settings) {
        this(operationKey, kind, currency, category, product, productId, variant, modifierGroup,
                modifierGroupId, modifierOption, mediaManifest, settings, null);
    }

    public enum Kind {
        CATEGORY, PRODUCT, VARIANT, MODIFIER_GROUP, MODIFIER_OPTION,
        ATTACH_MODIFIER_GROUP, MEDIA_MANIFEST, ORDERING_SETTINGS, COMPLETE_CATALOG, HANDOFF
    }

    public record MediaEntry(
            @NotBlank @Size(max = 255) String originalFilename,
            @NotNull UUID restaurantId,
            UUID productId,
            UUID variantId,
            @NotNull Association intendedAssociation,
            @NotNull ReviewStatus reviewStatus,
            @Pattern(regexp = "[0-9a-fA-F]{64}") String originalContentHash,
            @NotNull UploadStatus uploadStatus) { }

    public enum Association { PRODUCT_IMAGE, VARIANT_IMAGE }
    public enum ReviewStatus { PENDING, APPROVED }
    /** Manifest review never certifies an external upload. UXI-04 has no Storage operation. */
    public enum UploadStatus { PENDING }
}
