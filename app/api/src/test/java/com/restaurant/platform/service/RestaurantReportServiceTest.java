package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.entity.RestaurantSettings;
import com.restaurant.platform.repository.OrderRepository;
import com.restaurant.platform.repository.PaymentRepository;
import com.restaurant.platform.repository.RestaurantSettingsRepository;
import com.restaurant.platform.repository.projection.DailyOrderAggregate;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.security.RestaurantPermission;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class RestaurantReportServiceTest {
    private OrderRepository orderRepository;
    private PaymentRepository paymentRepository;
    private RestaurantSettingsRepository settingsRepository;
    private RestaurantAuthorization authorization;
    private RestaurantReportService service;

    private final UUID restaurantId = UUID.randomUUID();
    private final LocalDate reportDate = LocalDate.of(2026, 10, 21);

    @BeforeEach
    void setUp() {
        orderRepository = mock(OrderRepository.class);
        paymentRepository = mock(PaymentRepository.class);
        settingsRepository = mock(RestaurantSettingsRepository.class);
        authorization = mock(RestaurantAuthorization.class);
        service = new RestaurantReportService(
                orderRepository, paymentRepository, settingsRepository, authorization);
    }

    @Test
    void reportUsesRestaurantTimezoneAndReturnsAggregateTotals() {
        RestaurantSettings settings = new RestaurantSettings();
        settings.setRestaurantId(restaurantId);
        settings.setTimezone("Asia/Yangon");
        when(settingsRepository.findById(restaurantId)).thenReturn(Optional.of(settings));
        DailyOrderAggregate aggregate = mock(DailyOrderAggregate.class);
        when(aggregate.getTotalOrders()).thenReturn(12L);
        when(aggregate.getPendingOrders()).thenReturn(2L);
        when(aggregate.getAcceptedOrders()).thenReturn(1L);
        when(aggregate.getPreparingOrders()).thenReturn(2L);
        when(aggregate.getReadyOrders()).thenReturn(1L);
        when(aggregate.getOutForDeliveryOrders()).thenReturn(1L);
        when(aggregate.getCompletedOrders()).thenReturn(4L);
        when(aggregate.getCancelledOrders()).thenReturn(1L);
        when(aggregate.getOrderAmountExcludingCancelled()).thenReturn(125000L);
        when(orderRepository.aggregateOrdersForCreatedWindow(
                eq(restaurantId), any(OffsetDateTime.class), any(OffsetDateTime.class)))
                .thenReturn(aggregate);
        when(paymentRepository.sumPaidAmountForRestaurantWindow(
                eq(restaurantId), any(OffsetDateTime.class), any(OffsetDateTime.class)))
                .thenReturn(98000L);

        var response = service.getDailyReport(restaurantId, reportDate);

        assertEquals(reportDate, response.reportDate());
        assertEquals("Asia/Yangon", response.timezone());
        assertEquals(12L, response.totalOrders());
        assertEquals(4L, response.completedOrders());
        assertEquals(1L, response.cancelledOrders());
        assertEquals(125000L, response.orderAmountExcludingCancelled());
        assertEquals(98000L, response.paidAmount());
        var window = org.mockito.ArgumentCaptor.forClass(OffsetDateTime.class);
        verify(orderRepository).aggregateOrdersForCreatedWindow(
                eq(restaurantId), window.capture(), window.capture());
        assertEquals(OffsetDateTime.parse("2026-10-21T00:00:00+06:30"), window.getAllValues().get(0));
        assertEquals(OffsetDateTime.parse("2026-10-22T00:00:00+06:30"), window.getAllValues().get(1));
        verify(authorization).requirePermission(restaurantId, RestaurantPermission.REPORT_READ);
    }

    @Test
    void futureReportDateIsRejectedUsingRestaurantLocalDate() {
        RestaurantSettings settings = new RestaurantSettings();
        settings.setRestaurantId(restaurantId);
        settings.setTimezone("Asia/Yangon");
        when(settingsRepository.findById(restaurantId)).thenReturn(Optional.of(settings));
        LocalDate tomorrow = LocalDate.now(java.time.ZoneId.of("Asia/Yangon")).plusDays(1);

        ApiException error = assertThrows(ApiException.class,
                () -> service.getDailyReport(restaurantId, tomorrow));

        assertEquals("FUTURE_REPORT_DATE", error.getCode());
        assertEquals(HttpStatus.BAD_REQUEST, error.getStatus());
        verifyNoInteractions(orderRepository, paymentRepository);
    }
}
