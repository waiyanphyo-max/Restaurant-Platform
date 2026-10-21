package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.notification.NotificationResponse;
import com.restaurant.platform.entity.AppNotification;
import com.restaurant.platform.repository.AppNotificationRepository;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class NotificationServiceTest {

    private AppNotificationRepository repository;
    private NotificationService service;
    private final UUID userId = UUID.randomUUID();
    private final UUID notificationId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        repository = mock(AppNotificationRepository.class);
        service = new NotificationService(repository);
    }

    @Test
    void listUsesOnlyAuthenticatedUserIdAndOptionalStatus() {
        AppNotification notification = notification();
        when(repository.findByUserIdAndStatusOrderByCreatedAtDesc(userId, "PENDING"))
                .thenReturn(List.of(notification));

        List<NotificationResponse> response = service.listForUser(userId, " pending ");

        assertEquals(1, response.size());
        assertEquals(notificationId, response.getFirst().id());
        verify(repository).findByUserIdAndStatusOrderByCreatedAtDesc(userId, "PENDING");
        verify(repository, never()).findByUserIdAndStatusOrderByCreatedAtDesc(any(), eq("READ"));
    }

    @Test
    void listWithoutFilterReturnsAllNotificationsForAuthenticatedUser() {
        when(repository.findByUserIdOrderByCreatedAtDesc(userId)).thenReturn(List.of(notification()));

        assertEquals(1, service.listForUser(userId, null).size());
        verify(repository).findByUserIdOrderByCreatedAtDesc(userId);
    }

    @Test
    void rejectsUnknownStatusFilter() {
        ApiException exception = assertThrows(
                ApiException.class, () -> service.listForUser(userId, "ALL_USERS"));

        assertEquals(HttpStatus.BAD_REQUEST, exception.getStatus());
        assertEquals("INVALID_NOTIFICATION_STATUS", exception.getCode());
        verifyNoInteractions(repository);
    }

    @Test
    void cannotReadNotificationOwnedByAnotherUser() {
        when(repository.findByIdAndUserId(notificationId, userId)).thenReturn(Optional.empty());

        ApiException exception = assertThrows(
                ApiException.class, () -> service.markReadForUser(userId, notificationId));

        assertEquals(HttpStatus.NOT_FOUND, exception.getStatus());
        assertEquals("NOTIFICATION_NOT_FOUND", exception.getCode());
        verify(repository, never()).save(any());
    }

    @Test
    void markReadIsIdempotentForOwnedNotification() {
        AppNotification notification = notification();
        when(repository.findByIdAndUserId(notificationId, userId)).thenReturn(Optional.of(notification));
        when(repository.save(notification)).thenReturn(notification);

        NotificationResponse response = service.markReadForUser(userId, notificationId);

        assertEquals("READ", response.status());
        assertNotNull(response.readAt());
        ArgumentCaptor<AppNotification> captor = ArgumentCaptor.forClass(AppNotification.class);
        verify(repository).save(captor.capture());
        assertEquals(userId, captor.getValue().getUserId());
    }

    private AppNotification notification() {
        AppNotification notification = new AppNotification();
        notification.setId(notificationId);
        notification.setUserId(userId);
        notification.setNotificationType("ORDER_UPDATE");
        notification.setTitle("Order updated");
        notification.setBody("Your order status changed.");
        notification.setChannel("IN_APP");
        notification.setStatus("PENDING");
        notification.setCreatedAt(OffsetDateTime.now());
        return notification;
    }
}
