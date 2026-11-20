package com.restaurant.platform.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import java.util.UUID;

/** One Owner-curated selection per restaurant, separate from ordinary MENU_MANAGE. */
@Getter @Setter @NoArgsConstructor
@Entity @Table(name = "restaurant_featured_product", schema = "public")
public class RestaurantFeaturedProduct {
    @Id @Column(name = "restaurant_id", nullable = false)
    private UUID restaurantId;
    @Column(name = "product_id")
    private UUID productId;
    @Column(name = "revision", nullable = false)
    private Long revision;
}
