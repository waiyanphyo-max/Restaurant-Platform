package com.restaurant.platform.controller;

import com.restaurant.platform.dto.menu.FeaturedProductResponse;
import com.restaurant.platform.dto.menu.UpdateFeaturedProductRequest;
import com.restaurant.platform.service.FeaturedProductService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;

@RestController @RequiredArgsConstructor
@RequestMapping("/api/v1/restaurants/{restaurantId}/featured-product")
public class FeaturedProductController {
    private final FeaturedProductService service;
    @GetMapping
    public ResponseEntity<FeaturedProductResponse> get(@PathVariable UUID restaurantId) {
        return noStore(service.get(restaurantId));
    }
    @PutMapping
    public ResponseEntity<FeaturedProductResponse> update(@PathVariable UUID restaurantId,
            @Valid @RequestBody UpdateFeaturedProductRequest request) {
        return noStore(service.update(restaurantId, request));
    }
    private ResponseEntity<FeaturedProductResponse> noStore(FeaturedProductResponse response) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(response);
    }
}
