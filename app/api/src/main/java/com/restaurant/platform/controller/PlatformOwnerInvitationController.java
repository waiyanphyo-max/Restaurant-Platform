package com.restaurant.platform.controller;

import com.restaurant.platform.dto.platform.OwnerInvitationResponse;
import com.restaurant.platform.service.OwnerOnboardingService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/platform/restaurants/{restaurantId}/owners/{ownerUserId}/invitation")
@PreAuthorize("@platformAdminAuthorization.requirePlatformAdmin() != null")
@RequiredArgsConstructor
public class PlatformOwnerInvitationController {
    private final OwnerOnboardingService onboarding;

    @PostMapping
    public OwnerInvitationResponse resend(@PathVariable UUID restaurantId, @PathVariable UUID ownerUserId) {
        return onboarding.resend(restaurantId, ownerUserId);
    }
}
