package com.restaurant.platform.entity;

import jakarta.persistence.*;
import java.util.UUID;
import java.time.OffsetDateTime;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** JPA mapping for public.restaurant_settings. Foreign keys are represented as UUID fields; PostgreSQL enforces the schema constraints. */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "restaurant_settings", schema = "public")
public class RestaurantSettings {
    @Id
    @Column(name = "restaurant_id", nullable = false)
    private UUID restaurantId;

    @Column(name = "currency", nullable = false, length = 10)
    private String currency = "MMK";

    @Column(name = "common_qr_token", nullable = false, unique = true, length = 64)
    private String commonQrToken;

    @Column(name = "timezone", nullable = false, length = 60)
    private String timezone = "Asia/Yangon";

    @Column(name = "minimum_order", nullable = false)
    private Long minimumOrder = 0L;

    @Column(name = "default_delivery_fee", nullable = false)
    private Long defaultDeliveryFee = 0L;

    @Column(name = "accepts_orders", nullable = false)
    private Boolean acceptsOrders = true;

    @Column(name = "allow_qr_order", nullable = false)
    private Boolean allowQrOrder = true;

    @Column(name = "allow_delivery", nullable = false)
    private Boolean allowDelivery = true;

    @Column(name = "allow_takeaway", nullable = false)
    private Boolean allowTakeaway = true;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

}
