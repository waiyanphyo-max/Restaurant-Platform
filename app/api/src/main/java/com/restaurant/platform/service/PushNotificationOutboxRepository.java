package com.restaurant.platform.service;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * JDBC operations for the push outbox. Each row represents one notification
 * delivered to one device, so a transient failure on one device does not resend
 * to other devices that have already received the notification.
 */
@Repository
public class PushNotificationOutboxRepository {

    private final NamedParameterJdbcTemplate jdbc;

    public PushNotificationOutboxRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<OutboxItem> claimBatch(int batchSize, int maxAttempts) {
        MapSqlParameterSource parameters = new MapSqlParameterSource()
                .addValue("batchSize", batchSize)
                .addValue("maxAttempts", maxAttempts);

        // Recover exhausted tasks that were left PROCESSING by a crashed worker.
        jdbc.update("""
                UPDATE public.push_notification_outbox
                SET status = 'FAILED',
                    locked_at = NULL,
                    last_error = 'RETRY_LIMIT_EXCEEDED'
                WHERE status = 'PROCESSING'
                  AND attempts >= :maxAttempts
                  AND locked_at < now() - interval '5 minutes'
                """, parameters);

        return jdbc.query("""
                WITH claimable AS (
                    SELECT id
                    FROM public.push_notification_outbox
                    WHERE attempts < :maxAttempts
                      AND (
                          (status = 'PENDING' AND next_attempt_at <= now())
                          OR (
                              status = 'PROCESSING'
                              AND locked_at < now() - interval '5 minutes'
                          )
                      )
                    ORDER BY created_at
                    LIMIT :batchSize
                    FOR UPDATE SKIP LOCKED
                )
                UPDATE public.push_notification_outbox AS outbox
                SET status = 'PROCESSING',
                    locked_at = now(),
                    attempts = outbox.attempts + 1,
                    last_error = NULL
                FROM claimable
                WHERE outbox.id = claimable.id
                RETURNING outbox.id, outbox.notification_id, outbox.user_id,
                          outbox.device_id, outbox.attempts
                """, parameters, (rs, rowNum) -> mapOutboxItem(rs));
    }

    public Optional<PushPayload> findPayload(UUID outboxId) {
        List<PushPayload> results = jdbc.query("""
                SELECT outbox.id AS outbox_id,
                       outbox.notification_id,
                       outbox.user_id,
                       outbox.device_id,
                       notification.notification_type,
                       notification.title,
                       notification.body,
                       device.push_token,
                       device.platform,
                       device.is_active
                FROM public.push_notification_outbox AS outbox
                JOIN public.notifications AS notification
                  ON notification.id = outbox.notification_id
                 AND notification.user_id = outbox.user_id
                JOIN public.user_devices AS device
                  ON device.id = outbox.device_id
                 AND device.user_id = outbox.user_id
                WHERE outbox.id = :outboxId
                """, new MapSqlParameterSource("outboxId", outboxId),
                (rs, rowNum) -> mapPayload(rs));
        return results.stream().findFirst();
    }

    public void markSent(UUID outboxId) {
        jdbc.update("""
                UPDATE public.push_notification_outbox
                SET status = 'SENT',
                    sent_at = now(),
                    locked_at = NULL,
                    last_error = NULL
                WHERE id = :id AND status = 'PROCESSING'
                """, new MapSqlParameterSource("id", outboxId));
    }

    public void markSkipped(UUID outboxId, String reasonCode) {
        jdbc.update("""
                UPDATE public.push_notification_outbox
                SET status = 'SKIPPED',
                    locked_at = NULL,
                    last_error = :reason
                WHERE id = :id AND status = 'PROCESSING'
                """, new MapSqlParameterSource()
                .addValue("id", outboxId)
                .addValue("reason", safeCode(reasonCode)));
    }

    public void markRetry(UUID outboxId, String errorCode, long delaySeconds, boolean terminal) {
        jdbc.update("""
                UPDATE public.push_notification_outbox
                SET status = :status,
                    next_attempt_at = now() + (:delaySeconds * interval '1 second'),
                    locked_at = NULL,
                    last_error = :errorCode
                WHERE id = :id AND status = 'PROCESSING'
                """, new MapSqlParameterSource()
                .addValue("id", outboxId)
                .addValue("status", terminal ? "FAILED" : "PENDING")
                .addValue("delaySeconds", Math.max(1L, delaySeconds))
                .addValue("errorCode", safeCode(errorCode)));
    }

    public void deactivateDevice(UUID deviceId, UUID userId) {
        jdbc.update("""
                UPDATE public.user_devices
                SET is_active = FALSE,
                    last_seen_at = now()
                WHERE id = :deviceId
                  AND user_id = :userId
                """, new MapSqlParameterSource()
                .addValue("deviceId", deviceId)
                .addValue("userId", userId));
    }

    private OutboxItem mapOutboxItem(ResultSet rs) throws SQLException {
        return new OutboxItem(
                rs.getObject("id", UUID.class),
                rs.getObject("notification_id", UUID.class),
                rs.getObject("user_id", UUID.class),
                rs.getObject("device_id", UUID.class),
                rs.getInt("attempts"));
    }

    private PushPayload mapPayload(ResultSet rs) throws SQLException {
        return new PushPayload(
                rs.getObject("outbox_id", UUID.class),
                rs.getObject("notification_id", UUID.class),
                rs.getObject("user_id", UUID.class),
                rs.getObject("device_id", UUID.class),
                rs.getString("notification_type"),
                rs.getString("title"),
                rs.getString("body"),
                rs.getString("push_token"),
                rs.getString("platform"),
                rs.getBoolean("is_active"));
    }

    private String safeCode(String value) {
        if (value == null || value.isBlank()) {
            return "PUSH_DELIVERY_FAILED";
        }
        return value.replaceAll("[^A-Za-z0-9_.:-]", "_")
                .substring(0, Math.min(value.replaceAll("[^A-Za-z0-9_.:-]", "_").length(), 500));
    }

    public record OutboxItem(
            UUID id,
            UUID notificationId,
            UUID userId,
            UUID deviceId,
            int attempts) {
    }

    public record PushPayload(
            UUID outboxId,
            UUID notificationId,
            UUID userId,
            UUID deviceId,
            String notificationType,
            String title,
            String body,
            String pushToken,
            String platform,
            boolean active) {
    }
}
