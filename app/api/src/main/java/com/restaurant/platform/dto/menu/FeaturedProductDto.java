package com.restaurant.platform.dto.menu;

import java.util.UUID;

/** Public editorial selection only; availability is evaluated from the current menu. */
public record FeaturedProductDto(UUID productId, Status status) {
    public enum Status { NONE, AVAILABLE, UNAVAILABLE }
    public static FeaturedProductDto none() { return new FeaturedProductDto(null, Status.NONE); }
    public static boolean isEligible(MenuProductDto product) {
        return product.available() && (product.variants().isEmpty() ? product.price() != null
                : product.variants().stream().anyMatch(variant -> variant.available() && variant.price() != null));
    }
}
