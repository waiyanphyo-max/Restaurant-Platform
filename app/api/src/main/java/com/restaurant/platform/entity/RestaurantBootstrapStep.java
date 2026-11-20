package com.restaurant.platform.entity;

import com.restaurant.platform.dto.platform.BootstrapStepRequest.Kind;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

/** Append-only receipt, committed in the same transaction as the domain operation. */
@Entity
@Table(name = "restaurant_bootstrap_steps", schema = "public",
        uniqueConstraints = @UniqueConstraint(columnNames = {"restaurant_id", "operation_key"}))
@Getter @Setter @NoArgsConstructor
public class RestaurantBootstrapStep {
    @Id private UUID id;
    @Column(name = "restaurant_id", nullable = false) private UUID restaurantId;
    @Column(name = "operation_key", nullable = false, length = 100) private String operationKey;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 40) private Kind kind;
    @Column(name = "request_hash", nullable = false, length = 64) private String requestHash;
    @Column(name = "resource_id") private UUID resourceId;
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "result", nullable = false, columnDefinition = "jsonb")
    private Map<String, Object> result;
    @Column(name = "actor_id", nullable = false) private UUID actorId;
    @Column(name = "completed_at", nullable = false) private OffsetDateTime completedAt;
    @Column(name = "step_index", nullable = false) private long stepIndex;
}
