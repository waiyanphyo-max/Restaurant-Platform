package com.restaurant.platform.controller;

import com.restaurant.platform.dto.menu.PublicMenuResponse;
import com.restaurant.platform.service.PublicMenuService;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/public")
public class PublicMenuController {

    private final PublicMenuService publicMenuService;

    public PublicMenuController(
            PublicMenuService publicMenuService
    ) {
        this.publicMenuService = publicMenuService;
    }

    @GetMapping("/restaurants/{restaurantId}/menu")
    public PublicMenuResponse getMenu(
            @PathVariable UUID restaurantId
    ) {
        return publicMenuService.getMenu(restaurantId);
    }
}