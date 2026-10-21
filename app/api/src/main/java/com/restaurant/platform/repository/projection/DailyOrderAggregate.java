package com.restaurant.platform.repository.projection;

public interface DailyOrderAggregate {
    Long getTotalOrders();
    Long getPendingOrders();
    Long getAcceptedOrders();
    Long getPreparingOrders();
    Long getReadyOrders();
    Long getOutForDeliveryOrders();
    Long getCompletedOrders();
    Long getCancelledOrders();
    Long getOrderAmountExcludingCancelled();
}
