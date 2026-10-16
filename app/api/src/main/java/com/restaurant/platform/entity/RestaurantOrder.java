package com.restaurant.platform.entity;

import jakarta.persistence.*;
import java.util.UUID;
import java.time.OffsetDateTime;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** JPA mapping for public.orders. Foreign keys are represented as UUID fields; PostgreSQL enforces the schema constraints. */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "orders", schema = "public")
public class RestaurantOrder {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "restaurant_id", nullable = false)
    private UUID restaurantId;

    @Column(name = "order_number", nullable = false, length = 30)
    private String orderNumber;

    @Column(name = "customer_id")
    private UUID customerId;

    @Column(name = "created_by_user_id")
    private UUID createdByUserId;

    @Column(name = "table_id")
    private UUID tableId;

    @Column(name = "queue_ticket_id", unique = true)
    private UUID queueTicketId;

    @Column(name = "delivery_zone_id")
    private UUID deliveryZoneId;

    @Column(name = "order_type", nullable = false, length = 20)
    private String orderType;

    @Column(name = "order_channel", nullable = false, length = 20)
    private String orderChannel;

    @Column(name = "status", nullable = false, length = 30)
    private String status = "PENDING";

    @Column(name = "subtotal", nullable = false)
    private Long subtotal;

    @Column(name = "delivery_fee", nullable = false)
    private Long deliveryFee = 0L;

    @Column(name = "discount_amount", nullable = false)
    private Long discountAmount = 0L;

    @Column(name = "total_amount", nullable = false)
    private Long totalAmount;

    @Column(name = "delivery_name", length = 150)
    private String deliveryName;

    @Column(name = "delivery_phone", length = 30)
    private String deliveryPhone;

    @Column(name = "delivery_address", columnDefinition = "text")
    private String deliveryAddress;

    @Column(name = "delivery_note", columnDefinition = "text")
    private String deliveryNote;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

}
