package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.order.QueueTicketManagerDto;
import com.restaurant.platform.entity.AppNotification;
import com.restaurant.platform.entity.DailyQueueCounter;
import com.restaurant.platform.entity.Order;
import com.restaurant.platform.entity.QueueTicket;
import com.restaurant.platform.entity.RestaurantSettings;
import com.restaurant.platform.repository.AppNotificationRepository;
import com.restaurant.platform.repository.DailyQueueCounterRepository;
import com.restaurant.platform.repository.OrderRepository;
import com.restaurant.platform.repository.QueueTicketRepository;
import com.restaurant.platform.repository.RestaurantSettingsRepository;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.security.RestaurantPermission;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class QueueManagementServiceTest {

    private QueueTicketRepository ticketRepository;
    private DailyQueueCounterRepository counterRepository;
    private RestaurantSettingsRepository settingsRepository;
    private OrderRepository orderRepository;
    private AppNotificationRepository notificationRepository;
    private RestaurantAuthorization authorization;
    private QueueManagementService service;

    private final UUID restaurantId = UUID.randomUUID();
    private final UUID ticketId = UUID.randomUUID();
    private final UUID orderId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        ticketRepository = mock(QueueTicketRepository.class);
        counterRepository = mock(DailyQueueCounterRepository.class);
        settingsRepository = mock(RestaurantSettingsRepository.class);
        orderRepository = mock(OrderRepository.class);
        notificationRepository = mock(AppNotificationRepository.class);
        authorization = mock(RestaurantAuthorization.class);
        service = new QueueManagementService(
                ticketRepository, counterRepository, settingsRepository,
                orderRepository, notificationRepository, authorization);
    }

    @Test
    void listsOnlyCurrentDayActiveQueueByDefault() {
        RestaurantSettings settings = new RestaurantSettings();
        settings.setRestaurantId(restaurantId);
        settings.setTimezone("Asia/Yangon");
        DailyQueueCounter counter = new DailyQueueCounter();
        counter.setId(UUID.randomUUID());
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Yangon"));

        when(settingsRepository.findById(restaurantId)).thenReturn(Optional.of(settings));
        when(counterRepository.findByRestaurantIdAndQueueDate(restaurantId, today))
                .thenReturn(Optional.of(counter));
        when(ticketRepository.findByDailyCounterIdOrderByQueueNumberAsc(counter.getId()))
                .thenReturn(List.of(
                        ticket(UUID.randomUUID(), "WAITING", 1),
                        ticket(UUID.randomUUID(), "READY", 2),
                        ticket(UUID.randomUUID(), "CALLED", 3),
                        ticket(UUID.randomUUID(), "COMPLETED", 4)));

        List<QueueTicketManagerDto> response = service.listQueue(restaurantId, null);

        assertEquals(List.of("WAITING", "READY", "CALLED"),
                response.stream().map(QueueTicketManagerDto::status).toList());
        verify(authorization).requirePermission(restaurantId, RestaurantPermission.QUEUE_MANAGE);
        verify(counterRepository).findByRestaurantIdAndQueueDate(restaurantId, today);
    }

    @Test
    void rejectsUnsupportedQueueStatusFilter() {
        RestaurantSettings settings = new RestaurantSettings();
        settings.setRestaurantId(restaurantId);
        settings.setTimezone("Asia/Yangon");
        when(settingsRepository.findById(restaurantId)).thenReturn(Optional.of(settings));

        ApiException exception = assertThrows(
                ApiException.class, () -> service.listQueue(restaurantId, "EVERYTHING"));

        assertEquals(HttpStatus.BAD_REQUEST, exception.getStatus());
        assertEquals("INVALID_QUEUE_STATUS", exception.getCode());
        verifyNoInteractions(ticketRepository, counterRepository);
    }

    @Test
    void callingReadyTicketChangesStatusAndCreatesNotification() {
        QueueTicket ticket = ticket(ticketId, "READY", 8);
        ticket.setRestaurantId(restaurantId);
        ticket.setReadyAt(OffsetDateTime.now());
        when(ticketRepository.findByIdAndRestaurantIdForUpdate(ticketId, restaurantId))
                .thenReturn(Optional.of(ticket));
        when(ticketRepository.save(ticket)).thenReturn(ticket);
        Order order = new Order();
        order.setId(orderId);
        when(orderRepository.findByQueueTicketId(ticketId)).thenReturn(Optional.of(order));

        QueueTicketManagerDto response = service.callTicket(restaurantId, ticketId);

        assertEquals("CALLED", response.status());
        assertNotNull(response.calledAt());
        verify(authorization).requirePermission(restaurantId, RestaurantPermission.QUEUE_MANAGE);
        verify(ticketRepository).findByIdAndRestaurantIdForUpdate(ticketId, restaurantId);
        ArgumentCaptor<AppNotification> notification = ArgumentCaptor.forClass(AppNotification.class);
        verify(notificationRepository).save(notification.capture());
        assertEquals(ticketId, notification.getValue().getQueueTicketId());
        assertEquals(orderId, notification.getValue().getOrderId());
        assertEquals("QUEUE_CALLED", notification.getValue().getNotificationType());
        assertEquals("IN_APP", notification.getValue().getChannel());
        assertEquals("PENDING", notification.getValue().getStatus());
    }

    @Test
    void cannotCallTicketBeforeOrderIsReady() {
        QueueTicket ticket = ticket(ticketId, "WAITING", 8);
        ticket.setRestaurantId(restaurantId);
        when(ticketRepository.findByIdAndRestaurantIdForUpdate(ticketId, restaurantId))
                .thenReturn(Optional.of(ticket));

        ApiException exception = assertThrows(
                ApiException.class, () -> service.callTicket(restaurantId, ticketId));

        assertEquals(HttpStatus.CONFLICT, exception.getStatus());
        assertEquals("INVALID_QUEUE_TRANSITION", exception.getCode());
        verify(ticketRepository, never()).save(any());
        verifyNoInteractions(notificationRepository);
    }

    @Test
    void cannotCallTicketFromAnotherRestaurant() {
        when(ticketRepository.findByIdAndRestaurantIdForUpdate(ticketId, restaurantId))
                .thenReturn(Optional.empty());

        ApiException exception = assertThrows(
                ApiException.class, () -> service.callTicket(restaurantId, ticketId));

        assertEquals(HttpStatus.NOT_FOUND, exception.getStatus());
        assertEquals("QUEUE_TICKET_NOT_FOUND", exception.getCode());
        verify(ticketRepository, never()).save(any());
        verifyNoInteractions(notificationRepository);
    }

    private QueueTicket ticket(UUID id, String status, int number) {
        QueueTicket ticket = new QueueTicket();
        ticket.setId(id);
        ticket.setRestaurantId(restaurantId);
        ticket.setDailyCounterId(UUID.randomUUID());
        ticket.setQueueNumber(number);
        ticket.setDisplayCode(String.format("%03d", number));
        ticket.setStatus(status);
        ticket.setCreatedAt(OffsetDateTime.now());
        return ticket;
    }
}
