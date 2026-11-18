package com.restaurant.platform.controller;

import com.restaurant.platform.dto.customer.CustomerProfileRequest;
import com.restaurant.platform.dto.customer.CustomerProfileResponse;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.service.CustomerProfileService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/customer/profile")
@RequiredArgsConstructor
public class CustomerProfileController {

    private final CustomerProfileService profileService;
    private final RestaurantAuthorization authorization;

    @GetMapping
    public ResponseEntity<CustomerProfileResponse> getMyProfile() {
        UUID userId = authorization.requireAuthenticatedUserId();
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(profileService.getMyProfile(userId));
    }

    @PutMapping
    public ResponseEntity<CustomerProfileResponse> updateMyProfile(
            @Valid @RequestBody CustomerProfileRequest request) {
        UUID userId = authorization.requireAuthenticatedUserId();
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(profileService.updateMyProfile(userId, request));
    }
}
