package com.restaurant.platform.service;

import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.Message;
import com.restaurant.platform.service.PushNotificationOutboxRepository.OutboxItem;
import com.restaurant.platform.service.PushNotificationOutboxRepository.PushPayload;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
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

        var message = ArgumentCaptor.forClass(Message.class);
        verify(firebaseMessaging).send(message.capture());
        assertEquals(Map.of("notificationId", payload.notificationId().toString(), "notificationType", "DELIVERY_ASSIGNED"),
                ReflectionTestUtils.getField(message.getValue(), "data"));
        var notification = ReflectionTestUtils.getField(message.getValue(), "notification");
        assertEquals("Delivery assigned", ReflectionTestUtils.getField(notification, "title"));
        assertEquals("Order 123 is ready for delivery.", ReflectionTestUtils.getField(notification, "body"));
        verify(outbox).markSent(item.id());
        verify(outbox, never()).markRetry(any(), any(), anyLong(), anyBoolean());
    }

    @Test
    void customerDeliverySendExposesOnlyGenericTextEvenIfQueuedWithPrivateContent() throws Exception {
        OutboxItem item = item(1);
        var payload = new PushPayload(item.id(), item.notificationId(), item.userId(), item.deviceId(),
                "ORDER_READY", "Your order is ready", "Order 123 is ready at Restaurant A.",
                "do-not-log-this-token", "ANDROID", true, true);
        when(outbox.claimBatch(20, 8)).thenReturn(List.of(item));
        when(outbox.findPayload(item.id())).thenReturn(Optional.of(payload));

        dispatcher.dispatchPending();

        var message = ArgumentCaptor.forClass(Message.class);
        verify(firebaseMessaging).send(message.capture());
        var notification = ReflectionTestUtils.getField(message.getValue(), "notification");
        assertEquals("Updates available", ReflectionTestUtils.getField(notification, "title"));
        assertEquals("Open the app to check for updates.", ReflectionTestUtils.getField(notification, "body"));
        Object data = ReflectionTestUtils.getField(message.getValue(), "data");
        assertTrue(data == null || Map.of().equals(data));
        verify(outbox).markSent(item.id());
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
                UUID.randomUUID(), "DELIVERY_ASSIGNED", "Delivery assigned", "Order 123 is ready for delivery.",
                "do-not-log-this-token", "ANDROID", active, false);
    }
}
