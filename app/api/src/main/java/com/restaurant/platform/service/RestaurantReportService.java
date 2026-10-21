package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.report.DailyOperationsReportResponse;
import com.restaurant.platform.entity.RestaurantSettings;
import com.restaurant.platform.repository.OrderRepository;
import com.restaurant.platform.repository.PaymentRepository;
import com.restaurant.platform.repository.RestaurantSettingsRepository;
import com.restaurant.platform.repository.projection.DailyOrderAggregate;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.security.RestaurantPermission;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.UUID;

@Service
public class RestaurantReportService {

    private final OrderRepository orderRepository;
    private final PaymentRepository paymentRepository;
    private final RestaurantSettingsRepository settingsRepository;
    private final RestaurantAuthorization authorization;

    public RestaurantReportService(
            OrderRepository orderRepository,
            PaymentRepository paymentRepository,
            RestaurantSettingsRepository settingsRepository,
            RestaurantAuthorization authorization) {
        this.orderRepository = orderRepository;
        this.paymentRepository = paymentRepository;
        this.settingsRepository = settingsRepository;
        this.authorization = authorization;
    }

    @Transactional(readOnly = true)
    public DailyOperationsReportResponse getDailyReport(
            UUID restaurantId, LocalDate requestedDate) {
        authorization.requirePermission(restaurantId, RestaurantPermission.REPORT_READ);
        RestaurantSettings settings = settingsRepository.findById(restaurantId)
                .orElseThrow(() -> new ApiException(HttpStatus.CONFLICT,
                        "RESTAURANT_SETTINGS_MISSING", "error.restaurant.settings-missing"));
        String timezone = settings.getTimezone() == null
                || settings.getTimezone().isBlank()
                ? "Asia/Yangon" : settings.getTimezone();
        ZoneId zone;
        try {
            zone = ZoneId.of(timezone);
        } catch (DateTimeException exception) {
            throw new ApiException(HttpStatus.CONFLICT,
                    "INVALID_RESTAURANT_TIMEZONE", "error.settings.invalid-timezone", timezone);
        }

        LocalDate reportDate = requestedDate == null ? LocalDate.now(zone) : requestedDate;
        if (reportDate.isAfter(LocalDate.now(zone))) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "FUTURE_REPORT_DATE", "error.report.future-date");
        }
        OffsetDateTime start = reportDate.atStartOfDay(zone).toOffsetDateTime();
        OffsetDateTime end = reportDate.plusDays(1).atStartOfDay(zone).toOffsetDateTime();

        DailyOrderAggregate aggregate = orderRepository.aggregateOrdersForCreatedWindow(
                restaurantId, start, end);
        long paidAmount = paymentRepository.sumPaidAmountForRestaurantWindow(
                restaurantId, start, end);

        return new DailyOperationsReportResponse(
                restaurantId, reportDate, timezone,
                value(aggregate.getTotalOrders()),
                value(aggregate.getPendingOrders()),
                value(aggregate.getAcceptedOrders()),
                value(aggregate.getPreparingOrders()),
                value(aggregate.getReadyOrders()),
                value(aggregate.getOutForDeliveryOrders()),
                value(aggregate.getCompletedOrders()),
                value(aggregate.getCancelledOrders()),
                value(aggregate.getOrderAmountExcludingCancelled()),
                paidAmount);
    }

    private long value(Long value) {
        return value == null ? 0L : value;
    }
}
