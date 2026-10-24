package com.restaurant.platform.config;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/** Test-only endpoints used to verify the configured security filter chain. */
@RestController
public class SecurityTestProbeController {

    @GetMapping("/api/v1/protected-probe")
    public String protectedProbe() {
        return "protected";
    }

    @GetMapping("/api/v1/public/restaurants/{restaurantId}/menu")
    public String publicMenu(@PathVariable UUID restaurantId) {
        return "public-menu";
    }
}
