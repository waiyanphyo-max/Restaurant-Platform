package com.restaurant.platform.controller;

import com.restaurant.platform.dto.restaurant.CreateRestaurantRequest;
import com.restaurant.platform.dto.restaurant.MyRestaurantResponse;
import com.restaurant.platform.dto.restaurant.RestaurantOnboardingResponse;
import com.restaurant.platform.dto.restaurant.RestaurantResponse;
import com.restaurant.platform.dto.restaurant.UpdateRestaurantRequest;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.service.RestaurantManagementService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class RestaurantManagementController {

    private final RestaurantManagementService restaurantService;
    private final RestaurantAuthorization authorization;

    @GetMapping("/my/restaurants")
    public List<MyRestaurantResponse> listMyRestaurants() {
        return restaurantService.listMyRestaurants(
                authorization.requireAuthenticatedUserId());
    }

    @PostMapping("/restaurants")
    @ResponseStatus(HttpStatus.CREATED)
    public RestaurantOnboardingResponse createRestaurant(
            @Valid @RequestBody CreateRestaurantRequest request) {
        return restaurantService.createRestaurant(
                authorization.requireAuthenticatedUserId(), request);
    }

    @GetMapping("/restaurants/{restaurantId}")
    public RestaurantResponse getRestaurant(@PathVariable UUID restaurantId) {
        return restaurantService.getRestaurant(restaurantId);
    }

    @PutMapping("/restaurants/{restaurantId}/profile")
    public RestaurantResponse updateRestaurant(
            @PathVariable UUID restaurantId,
            @Valid @RequestBody UpdateRestaurantRequest request) {
        return restaurantService.updateRestaurant(
                restaurantId, authorization.requireAuthenticatedUserId(), request);
    }
}
