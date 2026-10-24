package com.restaurant.platform.service;

import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.Message;
import com.restaurant.platform.service.PushNotificationOutboxRepository.OutboxItem;
import com.restaurant.platform.service.PushNotificationOutboxRepository.PushPayload;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class FirebasePushDispatcherTest {

    private PushNotificationOutboxRepository outbox;
    private FirebaseMessaging firebaseMessaging;
    private FirebasePushDispatcher dispatcher;

    @BeforeEach
    void setUp() {
        outbox = mock(PushNotificationOutboxRepository.class);
        firebaseMessaging = mock(FirebaseMessaging.class);
        dispatcher = new FirebasePushDispatcher(outbox, firebaseMessaging, 20, 8, 3600);
    }

    @Test
    void successfulSendMarksOnlyThatDeviceOutboxRowSent() throws Exception {
        OutboxItem item = item(1);
        PushPayload payload = payload(true);
        when(outbox.claimBatch(20, 8)).thenReturn(List.of(item));
        when(outbox.findPayload(item.id())).thenReturn(Optional.of(payload));
        when(firebaseMessaging.send(any(Message.class))).thenReturn("projects/test/messages/123");

        dispatcher.dispatchPending();

        verify(firebaseMessaging).send(any(Message.class));
        verify(outbox).markSent(item.id());
        verify(outbox, never()).markRetry(any(), any(), anyLong(), anyBoolean());
    }

    @Test
    void inactiveDeviceIsSkippedWithoutCallingFirebase() throws Exception {
        OutboxItem item = item(1);
        when(outbox.claimBatch(20, 8)).thenReturn(List.of(item));
        when(outbox.findPayload(item.id())).thenReturn(Optional.of(payload(false)));

        dispatcher.dispatchPending();

        verify(firebaseMessaging, never()).send(any(Message.class));
        verify(outbox).markSkipped(item.id(), "DEVICE_INACTIVE_OR_TOKEN_MISSING");
    }

    @Test
    void transientWorkerFailureSchedulesRetryWithoutLoggingToken() throws Exception {
        OutboxItem item = item(1);
        when(outbox.claimBatch(20, 8)).thenReturn(List.of(item));
        when(outbox.findPayload(item.id())).thenReturn(Optional.of(payload(true)));
        when(firebaseMessaging.send(any(Message.class)))
                .thenThrow(new IllegalStateException("test failure"));

        dispatcher.dispatchPending();

        verify(outbox).markRetry(
                item.id(), "PUSH_WORKER_IllegalStateException", 30L, false);
        verify(outbox, never()).markSent(item.id());
    }

    private OutboxItem item(int attempts) {
        return new OutboxItem(
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                UUID.randomUUID(), attempts);
    }

    private PushPayload payload(boolean active) {
        return new PushPayload(
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                UUID.randomUUID(), "ORDER_READY", "Order ready", "Your order is ready.",
                "do-not-log-this-token", "ANDROID", active);
    }
}
