package com.restaurant.platform.entity;

import jakarta.persistence.*;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** JPA mapping for public.delivery_zones. Foreign keys are represented as UUID fields; PostgreSQL enforces the schema constraints. */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "delivery_zones", schema = "public")
public class DeliveryZone {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "restaurant_id", nullable = false)
    private UUID restaurantId;

    @Column(name = "name", nullable = false, length = 100)
    private String name;

    @Column(name = "delivery_fee", nullable = false)
    private Long deliveryFee = 0L;

    @Column(name = "minimum_order", nullable = false)
    private Long minimumOrder = 0L;

    @Column(name = "is_active", nullable = false)
    private Boolean isActive = true;

    @Column(name = "coverage_city", length = 100)
    private String coverageCity;

    @Column(name = "coverage_township", length = 100)
    private String coverageTownship;

}
