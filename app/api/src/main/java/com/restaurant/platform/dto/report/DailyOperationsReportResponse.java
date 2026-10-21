package com.restaurant.platform.dto.report;

import java.time.LocalDate;
import java.util.UUID;

public record DailyOperationsReportResponse(
        UUID restaurantId,
        LocalDate reportDate,
        String timezone,
        long totalOrders,
        long pendingOrders,
        long acceptedOrders,
        long preparingOrders,
        long readyOrders,
        long outForDeliveryOrders,
        long completedOrders,
        long cancelledOrders,
        long orderAmountExcludingCancelled,
        long paidAmount
) {
}
