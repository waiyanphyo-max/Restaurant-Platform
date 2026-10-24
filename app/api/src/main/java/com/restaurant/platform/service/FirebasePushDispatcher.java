package com.restaurant.platform.service;

import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.FirebaseMessagingException;
import com.google.firebase.messaging.Message;
import com.google.firebase.messaging.MessagingErrorCode;
import com.google.firebase.messaging.Notification;
import com.restaurant.platform.service.PushNotificationOutboxRepository.OutboxItem;
import com.restaurant.platform.service.PushNotificationOutboxRepository.PushPayload;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;

/**
 * Sends outbox messages only when Firebase is explicitly enabled. Delivery state is
 * tracked per device, so one invalid/offline device does not block other recipients.
 */
@Component
@ConditionalOnProperty(prefix = "app.push.firebase", name = "enabled", havingValue = "true")
public class FirebasePushDispatcher {

    private static final Logger log = LoggerFactory.getLogger(FirebasePushDispatcher.class);

    private final PushNotificationOutboxRepository outbox;
    private final FirebaseMessaging firebaseMessaging;
    private final int batchSize;
    private final int maxAttempts;
    private final long maxRetryDelaySeconds;

    public FirebasePushDispatcher(
            PushNotificationOutboxRepository outbox,
            FirebaseMessaging firebaseMessaging,
            @Value("${app.push.outbox.batch-size:20}") int batchSize,
            @Value("${app.push.outbox.max-attempts:8}") int maxAttempts,
            @Value("${app.push.outbox.max-retry-delay-seconds:3600}") long maxRetryDelaySeconds) {
        this.outbox = outbox;
        this.firebaseMessaging = firebaseMessaging;
        this.batchSize = Math.max(1, Math.min(batchSize, 100));
        this.maxAttempts = Math.max(1, maxAttempts);
        this.maxRetryDelaySeconds = Math.max(30L, maxRetryDelaySeconds);
    }

    @Scheduled(fixedDelayString = "${app.push.outbox.poll-interval-ms:5000}")
    public void dispatchPending() {
        final List<OutboxItem> batch;
        try {
            batch = outbox.claimBatch(batchSize, maxAttempts);
        } catch (RuntimeException exception) {
            log.error("Could not claim push notification outbox items ({})",
                    exception.getClass().getSimpleName());
            return;
        }

        for (OutboxItem item : batch) {
            dispatchOne(item);
        }
    }

    private void dispatchOne(OutboxItem item) {
        try {
            Optional<PushPayload> optionalPayload = outbox.findPayload(item.id());
            if (optionalPayload.isEmpty()) {
                outbox.markSkipped(item.id(), "PUSH_TARGET_NOT_FOUND");
                return;
            }

            PushPayload payload = optionalPayload.get();
            if (!payload.active() || payload.pushToken() == null || payload.pushToken().isBlank()) {
                outbox.markSkipped(item.id(), "DEVICE_INACTIVE_OR_TOKEN_MISSING");
                return;
            }

            Message message = Message.builder()
                    .setToken(payload.pushToken())
                    .setNotification(Notification.builder()
                            .setTitle(payload.title())
                            .setBody(payload.body())
                            .build())
                    .putData("notificationId", payload.notificationId().toString())
                    .putData("notificationType", payload.notificationType())
                    .build();

            // The token is intentionally never logged.
            firebaseMessaging.send(message);
            outbox.markSent(item.id());
        } catch (FirebaseMessagingException exception) {
            handleFirebaseFailure(item, exception);
        } catch (RuntimeException exception) {
            handleRetry(item, "PUSH_WORKER_" + exception.getClass().getSimpleName());
        }
    }

    private void handleFirebaseFailure(OutboxItem item, FirebaseMessagingException exception) {
        MessagingErrorCode messagingCode = exception.getMessagingErrorCode();
        String code = messagingCode == null ? "FCM_SEND_FAILED" : messagingCode.name();

        if (messagingCode == MessagingErrorCode.UNREGISTERED) {
            try {
                outbox.deactivateDevice(item.deviceId(), item.userId());
                outbox.markSkipped(item.id(), "TOKEN_UNREGISTERED");
                log.info("Skipped push outbox item {} because its device token is unregistered",
                        item.id());
            } catch (RuntimeException storageException) {
                handleRetry(item, "PUSH_STATE_" + storageException.getClass().getSimpleName());
            }
            return;
        }

        handleRetry(item, code);
    }

    private void handleRetry(OutboxItem item, String errorCode) {
        boolean terminal = item.attempts() >= maxAttempts;
        long delay = Math.min(
                maxRetryDelaySeconds,
                30L * (1L << Math.min(10, Math.max(0, item.attempts() - 1))));
        try {
            outbox.markRetry(item.id(), errorCode, delay, terminal);
            if (terminal) {
                log.warn("Push outbox item {} reached retry limit; final error code {}",
                        item.id(), errorCode);
            } else {
                log.info("Push outbox item {} will retry after {} seconds; error code {}",
                        item.id(), delay, errorCode);
            }
        } catch (RuntimeException storageException) {
            log.error("Could not record push retry state for outbox item {} ({})",
                    item.id(), storageException.getClass().getSimpleName());
        }
    }
}
