package com.restaurant.platform.controller;

import com.restaurant.platform.dto.restaurant.RestaurantLogoResponse;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.service.RestaurantLogoService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/restaurants/{restaurantId}/logo")
@RequiredArgsConstructor
public class RestaurantLogoController {

    private final RestaurantLogoService logoService;
    private final RestaurantAuthorization authorization;

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.OK)
    public RestaurantLogoResponse upload(
            @PathVariable UUID restaurantId,
            @RequestPart("file") MultipartFile file) {
        return logoService.upload(
                restaurantId, authorization.requireAuthenticatedUserId(), file);
    }
}
