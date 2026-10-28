package com.restaurant.platform.controller;

import com.restaurant.platform.dto.platform.PlatformOverviewResponse;
import com.restaurant.platform.dto.platform.PlatformRestaurantSummaryResponse;
import com.restaurant.platform.service.PlatformAdminDashboardService;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@PreAuthorize("@platformAdminAuthorization.requirePlatformAdmin() != null")
@RequestMapping("/api/v1/platform")
@RequiredArgsConstructor
@Validated
public class PlatformAdminDashboardController {
    private final PlatformAdminDashboardService dashboardService;

    @GetMapping("/overview")
    public PlatformOverviewResponse getOverview() {
        return dashboardService.getOverview();
    }

    @GetMapping("/restaurants")
    public Page<PlatformRestaurantSummaryResponse> listRestaurants(
            @RequestParam(defaultValue = "") String search,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return dashboardService.listRestaurants(search, page, size);
    }
}