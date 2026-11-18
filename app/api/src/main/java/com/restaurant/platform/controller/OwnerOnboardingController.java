package com.restaurant.platform.controller;

import com.restaurant.platform.dto.platform.OwnerOnboardingResponse;
import com.restaurant.platform.service.OwnerOnboardingService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/owner-onboarding")
@RequiredArgsConstructor
public class OwnerOnboardingController {
    private final OwnerOnboardingService onboarding;

    @PostMapping("/complete")
    public OwnerOnboardingResponse complete() {
        return onboarding.complete();
    }
}
