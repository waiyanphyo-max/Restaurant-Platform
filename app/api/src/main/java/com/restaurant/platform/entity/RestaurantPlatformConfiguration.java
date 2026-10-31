package com.restaurant.platform.entity;

import com.restaurant.platform.dto.platform.PlatformRestaurantConfiguration;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;
import java.util.UUID;

/** Separate additive table, leaving the existing restaurant/settings contracts unchanged. */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "restaurant_platform_configuration", schema = "public")
public class RestaurantPlatformConfiguration {
    @Id
    @Column(name = "restaurant_id", nullable = false)
    private UUID restaurantId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "configuration", nullable = false, columnDefinition = "jsonb")
    private PlatformRestaurantConfiguration configuration;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;
}
