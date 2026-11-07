package com.restaurant.platform.dto.customer;

import com.restaurant.platform.dto.order.OrderItemDetailDto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public record CustomerOrderDetailDto(
        UUID id,
        UUID restaurantId,
        String orderNumber,
        String orderType,
        String orderChannel,
        String status,
        long subtotal,
        long deliveryFee,
        long discountAmount,
        long totalAmount,
        String deliveryName,
        String deliveryPhone,
        String deliveryAddress,
        String deliveryNote,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt,
        List<OrderItemDetailDto> items,
        List<CustomerOrderStatusDto> statusHistory,
        List<CustomerPaymentDto> payments,
        CustomerDeliveryStatusDto delivery,
        BigDecimal deliveryLatitude,
        BigDecimal deliveryLongitude,
        String deliveryTownship,
        String deliveryCity,
        String deliveryLocationSource,
        UUID deliveryAddressId,
        OffsetDateTime destinationConfirmedAt,
        boolean canCancel,
        String currency
) {
    public CustomerOrderDetailDto {
        items = items == null ? List.of() : List.copyOf(items);
        statusHistory = statusHistory == null ? List.of() : List.copyOf(statusHistory);
        payments = payments == null ? List.of() : List.copyOf(payments);
    }
}
