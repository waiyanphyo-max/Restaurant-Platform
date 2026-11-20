package com.restaurant.platform.dto.menu;

import java.util.UUID;

public record FeaturedProductResponse(
        UUID restaurantId, UUID productId, FeaturedProductDto.Status status, long revision) { }
