package com.restaurant.platform.entity;

import jakarta.persistence.*;
import java.util.UUID;
import java.time.OffsetDateTime;
import org.hibernate.annotations.CreationTimestamp;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** JPA mapping for public.queue_tickets. Foreign keys are represented as UUID fields; PostgreSQL enforces the schema constraints. */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "queue_tickets", schema = "public")
public class QueueTicket {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "restaurant_id", nullable = false)
    private UUID restaurantId;

    @Column(name = "daily_counter_id", nullable = false)
    private UUID dailyCounterId;

    @Column(name = "customer_id")
    private UUID customerId;

    @Column(name = "queue_number", nullable = false)
    private Integer queueNumber;

    @Column(name = "display_code", nullable = false, length = 20)
    private String displayCode;

    @Column(name = "status", nullable = false, length = 20)
    private String status = "WAITING";

    @Column(name = "public_token_hash", unique = true, length = 128)
    private String publicTokenHash;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "ready_at")
    private OffsetDateTime readyAt;

    @Column(name = "called_at")
    private OffsetDateTime calledAt;

    @Column(name = "completed_at")
    private OffsetDateTime completedAt;

}
