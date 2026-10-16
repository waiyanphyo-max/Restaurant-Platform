package com.restaurant.platform.entity;

import jakarta.persistence.*;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** JPA mapping for public.order_item_modifiers. Foreign keys are represented as UUID fields; PostgreSQL enforces the schema constraints. */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "order_item_modifiers", schema = "public")
public class OrderItemModifier {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "restaurant_id", nullable = false)
    private UUID restaurantId;

    @Column(name = "order_item_id", nullable = false)
    private UUID orderItemId;

    @Column(name = "modifier_option_id", nullable = false)
    private UUID modifierOptionId;

    @Column(name = "name", nullable = false, length = 100)
    private String name;

    @Column(name = "additional_price", nullable = false)
    private Long additionalPrice;

    @Column(name = "quantity", nullable = false)
    private Integer quantity = 1;

}
