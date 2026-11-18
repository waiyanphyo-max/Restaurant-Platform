package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.entity.Order;
import com.restaurant.platform.entity.Payment;
import com.restaurant.platform.repository.OrderItemRepository;
import com.restaurant.platform.repository.PaymentRepository;
import com.restaurant.platform.repository.ProductRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.TreeMap;
import java.util.UUID;

@Service
public class OrderCancellationService {
    private final OrderItemRepository items;
    private final PaymentRepository payments;
    private final ProductRepository products;

    public OrderCancellationService(OrderItemRepository items, PaymentRepository payments, ProductRepository products) {
        this.items = items;
        this.payments = payments;
        this.products = products;
    }

    /** The caller holds the restaurant and order locks and records the resulting cancellation. */
    @Transactional(propagation = Propagation.MANDATORY)
    String settleUnpaidOrder(Order order) {
        var orderPayments = payments.findByOrderIdOrderByCreatedAtDesc(order.getId());
        requireUnpaidPayments(orderPayments);

        String stockNote = "PENDING".equals(order.getStatus()) || "ACCEPTED".equals(order.getStatus())
                ? releaseReservations(order)
                : "Stock retained because preparation had started.";
        return stockNote + " " + closePendingPayments(orderPayments);
    }

    /** Narrow staff permission never includes cancelling collected cash or issuing refunds. */
    @Transactional(propagation = Propagation.MANDATORY)
    void requireUnpaid(Order order) {
        requireUnpaidPayments(payments.findByOrderIdOrderByCreatedAtDesc(order.getId()));
    }

    private void requireUnpaidPayments(List<Payment> orderPayments) {
        if (orderPayments.stream()
                .anyMatch(payment -> payment.getPaidAt() != null || payment.getCollectedByUserId() != null
                        || List.of("PAID", "REFUNDED", "PARTIALLY_REFUNDED").contains(payment.getStatus()))) {
            throw new ApiException(HttpStatus.CONFLICT, "REFUND_REQUIRED", "error.customer-order.refund-required");
        }
    }

    java.util.Set<UUID> settledOrderIds(UUID restaurantId, List<UUID> orderIds) {
        return orderIds.isEmpty() ? java.util.Set.of()
                : java.util.Set.copyOf(payments.findSettledOrderIds(restaurantId, orderIds));
    }

    /** Collected cash requires the separate refund workflow; stock follows the existing counter review policy. */
    @Transactional(propagation = Propagation.MANDATORY)
    String closePendingCounterPayments(Order order) {
        var orderPayments = payments.findByOrderIdOrderByCreatedAtDesc(order.getId());
        requireUnpaidPayments(orderPayments);
        var counterPayments = orderPayments.stream()
                .filter(payment -> "CASH_AT_COUNTER".equals(payment.getMethod()))
                .toList();
        return closePendingPayments(counterPayments);
    }

    private String closePendingPayments(List<Payment> orderPayments) {
        int cancelledPayments = 0;
        for (Payment payment : orderPayments) {
            if ("PENDING".equals(payment.getStatus())) {
                payment.setStatus("CANCELLED");
                payments.save(payment);
                cancelledPayments++;
            }
        }
        return "Closed pending payments as cancelled (" + cancelledPayments + ").";
    }

    private String releaseReservations(Order order) {
        var quantities = new TreeMap<UUID, Integer>();
        boolean unknown = false;
        for (var item : items.findByOrderIdAndRestaurantIdOrderByCreatedAtAsc(order.getId(), order.getRestaurantId())) {
            Integer reserved = item.getReservedStockQuantity();
            if (reserved == null) {
                unknown = true;
            } else if (reserved > 0) {
                quantities.merge(item.getProductId(), reserved, Integer::sum);
            }
        }

        long released = 0;
        for (var reservation : quantities.entrySet()) {
            if (products.releaseStock(reservation.getKey(), order.getRestaurantId(), reservation.getValue()) != 1) {
                throw new ApiException(HttpStatus.CONFLICT, "ORDER_STOCK_RELEASE_FAILED",
                        "error.customer-order.stock-release-failed");
            }
            released += reservation.getValue();
        }
        String note = "Reserved stock units released (" + released + ").";
        return unknown ? note + " Historical items without reservation evidence require stock review." : note;
    }
}
