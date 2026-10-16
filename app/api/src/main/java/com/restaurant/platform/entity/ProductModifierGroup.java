package com.restaurant.platform.entity;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Join table enforcing same-restaurant product/modifier-group membership. */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "product_modifier_groups", schema = "public")
public class ProductModifierGroup {
    @EmbeddedId
    private ProductModifierGroupId id;

    @Column(name = "restaurant_id", nullable = false)
    private UUID restaurantId;
}
