package com.restaurant.platform.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.UUID;

/** The sole editable runtime palette; access is mediated by Spring authorization. */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "restaurant_runtime_branding", schema = "public")
public class RestaurantRuntimeBranding {
    @Id
    @Column(name = "restaurant_id", nullable = false)
    private UUID restaurantId;
    @Column(name = "primary_color", nullable = false, length = 7)
    private String primaryColor;
    @Column(name = "secondary_color", nullable = false, length = 7)
    private String secondaryColor;
    @Column(name = "background_color", nullable = false, length = 7)
    private String backgroundColor;
    @Column(name = "revision", nullable = false)
    private long revision;
}
