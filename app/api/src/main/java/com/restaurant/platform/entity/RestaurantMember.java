package com.restaurant.platform.entity;

import com.restaurant.platform.security.RestaurantRole;
import jakarta.persistence.*;
import java.util.UUID;
import java.time.OffsetDateTime;
import org.hibernate.annotations.CreationTimestamp;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** JPA mapping for public.restaurant_members. Foreign keys are represented as UUID fields; PostgreSQL enforces the schema constraints. */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "restaurant_members", schema = "public")
public class RestaurantMember {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "restaurant_id", nullable = false)
    private UUID restaurantId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(name = "role", nullable = false, length = 30)
    private RestaurantRole role;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

}
