package com.restaurant.platform.controller;

import com.restaurant.platform.dto.menu.ModifierGroupResponse;
import com.restaurant.platform.service.CatalogManagementService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/public/restaurants/{restaurantId}/products/{productId}/modifier-groups")
@RequiredArgsConstructor
public class PublicModifierController {

    private final CatalogManagementService catalogService;

    @GetMapping
    public List<ModifierGroupResponse> listAvailableModifiers(
            @PathVariable UUID restaurantId,
            @PathVariable UUID productId) {
        return catalogService.listPublicProductModifierGroups(restaurantId, productId);
    }
}
