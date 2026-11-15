package com.restaurant.platform.repository;

import com.restaurant.platform.common.error.ApiException;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;

/** Privileged backend storage. No browser/mobile role can write completion or cooldown state. */
@Repository
public class OwnerOnboardingRepository {
    private final NamedParameterJdbcTemplate jdbc;
    private final TransactionTemplate transaction;

    public OwnerOnboardingRepository(NamedParameterJdbcTemplate jdbc, PlatformTransactionManager manager) {
        this.jdbc = jdbc;
        this.transaction = new TransactionTemplate(manager);
        // A provider failure or the caller's transaction must never roll back a consumed cooldown.
        this.transaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    public Optional<OffsetDateTime> findCompletedAt(UUID userId) {
        return stored(() -> transaction.execute(status -> completedAt(userId)));
    }

    public Reservation reserve(UUID restaurantId, UUID ownerId, UUID actorId) {
        return stored(() -> transaction.execute(status -> {
            List.of("owner-onboarding:" + ownerId, "owner-invitation-actor:" + actorId)
                    .stream().sorted().forEach(this::lock);
            requireOwner(restaurantId, ownerId);
            if (completedAt(ownerId).isPresent()) {
                throw new ApiException(HttpStatus.CONFLICT, "OWNER_ONBOARDING_COMPLETE",
                        "error.owner-onboarding.complete");
            }
            Map<String, Object> params = Map.of("owner", ownerId, "actor", actorId);
            Integer count = jdbc.queryForObject("""
                    SELECT count(*) FROM public.owner_invitation_attempts
                    WHERE (owner_user_id = :owner AND requested_at > CURRENT_TIMESTAMP - interval '60 seconds')
                       OR (owner_user_id = :owner AND requested_at > CURRENT_TIMESTAMP - interval '1 hour'
                           AND (SELECT count(*) FROM public.owner_invitation_attempts
                                WHERE owner_user_id = :owner AND requested_at > CURRENT_TIMESTAMP - interval '1 hour') >= 5)
                       OR (requested_by_user_id = :actor AND requested_at > CURRENT_TIMESTAMP - interval '1 hour'
                           AND (SELECT count(*) FROM public.owner_invitation_attempts
                                WHERE requested_by_user_id = :actor AND requested_at > CURRENT_TIMESTAMP - interval '1 hour') >= 20)
                    """, params, Integer.class);
            if (count != null && count > 0) {
                throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "OWNER_INVITATION_RATE_LIMITED",
                        "error.owner-onboarding.rate-limited");
            }
            UUID attemptId = UUID.randomUUID();
            return jdbc.queryForObject("""
                    INSERT INTO public.owner_invitation_attempts
                        (id, restaurant_id, owner_user_id, requested_by_user_id)
                    VALUES (:id, :restaurant, :owner, :actor)
                    RETURNING id, requested_at, requested_at + interval '60 seconds' AS next_allowed_at
                    """, Map.of("id", attemptId, "restaurant", restaurantId, "owner", ownerId, "actor", actorId),
                    (rs, row) -> new Reservation(rs.getObject("id", UUID.class), time(rs, "requested_at"),
                            time(rs, "next_allowed_at")));
        }));
    }

    public void finish(UUID attemptId, String outcome, String errorCode) {
        stored(() -> transaction.execute(status -> jdbc.update("""
                UPDATE public.owner_invitation_attempts
                SET outcome = :outcome, error_code = :code, finished_at = CURRENT_TIMESTAMP
                WHERE id = :id AND outcome = 'RESERVED'
                """, new org.springframework.jdbc.core.namedparam.MapSqlParameterSource()
                .addValue("id", attemptId).addValue("outcome", outcome).addValue("code", errorCode))));
    }

    public OffsetDateTime complete(UUID userId) {
        return stored(() -> transaction.execute(status -> {
            lock("owner-onboarding:" + userId);
            requireOwner(null, userId);
            return jdbc.queryForObject("""
                    INSERT INTO public.owner_account_onboarding (user_id, password_verified_at)
                    VALUES (:user, CURRENT_TIMESTAMP)
                    ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
                    RETURNING password_verified_at
                    """, Map.of("user", userId), (rs, row) -> time(rs, "password_verified_at"));
        }));
    }

    private Optional<OffsetDateTime> completedAt(UUID userId) {
        return jdbc.query("SELECT password_verified_at FROM public.owner_account_onboarding WHERE user_id = :user",
                Map.of("user", userId), (rs, row) -> time(rs, "password_verified_at")).stream().findFirst();
    }

    private void requireOwner(UUID restaurantId, UUID userId) {
        String scope = restaurantId == null ? "" : " AND member.restaurant_id = :restaurant";
        var parameters = new org.springframework.jdbc.core.namedparam.MapSqlParameterSource("user", userId)
                .addValue("restaurant", restaurantId);
        List<UUID> rows = jdbc.query("""
                SELECT member.id FROM public.restaurant_members member
                JOIN auth.users account ON account.id = member.user_id
                JOIN public.restaurants restaurant ON restaurant.id = member.restaurant_id
                WHERE member.user_id = :user AND member.role = 'OWNER'
                  AND restaurant.is_active = true
                  AND account.deleted_at IS NULL
                  AND (account.banned_until IS NULL OR account.banned_until <= CURRENT_TIMESTAMP)
                """ + scope + " FOR UPDATE OF member, account, restaurant", parameters,
                (rs, row) -> rs.getObject("id", UUID.class));
        if (rows.isEmpty()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "RESTAURANT_OWNER_NOT_FOUND",
                    "error.owner-onboarding.owner-not-found");
        }
    }

    private void lock(String key) {
        jdbc.query("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))", Map.of("key", key),
                (org.springframework.jdbc.core.ResultSetExtractor<Void>) rs -> null);
    }

    private <T> T stored(Supplier<T> operation) {
        try {
            return operation.get();
        } catch (DataAccessException exception) {
            // Includes an unapplied migration; do not leak SQL/schema details to a caller.
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "OWNER_INVITATION_NOT_CONFIGURED",
                    "error.owner-onboarding.unavailable");
        }
    }

    private static OffsetDateTime time(ResultSet rs, String column) throws SQLException {
        return rs.getObject(column, OffsetDateTime.class);
    }

    public record Reservation(UUID id, OffsetDateTime requestedAt, OffsetDateTime nextAllowedAt) {}
}
