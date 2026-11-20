package com.restaurant.platform.dto.platform;

import com.restaurant.platform.dto.menu.*;
import com.restaurant.platform.dto.restaurant.RestaurantBrandingResponse;
import com.restaurant.platform.dto.settings.RestaurantSettingsResponse;
import java.util.List;
import java.util.UUID;

public record RestaurantBootstrapResponse(
        UUID restaurantId, String currency, List<BootstrapStepResponse> steps,
        List<CategoryResponse> categories, List<ProductManagementResponse> products,
        List<ProductVariantResponse> variants, List<ModifierGroupResponse> modifierGroups,
        List<ProductModifierGroup> productModifierGroups, boolean catalogComplete,
        List<BootstrapStepRequest.MediaEntry> mediaManifest, RestaurantBrandingResponse branding,
        List<PlatformRestaurantDetailResponse.Owner> owners, boolean ownerOnboardingConfirmed,
        String photosStatus, String nativeBuildStatus,
        boolean handoffReady, boolean handedOff, List<String> blockers, RestaurantSettingsResponse settings) {
    public record ProductModifierGroup(UUID productId, UUID modifierGroupId) { }
}
