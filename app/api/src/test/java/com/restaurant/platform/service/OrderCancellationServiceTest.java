package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.entity.Order;
import com.restaurant.platform.entity.Payment;
import com.restaurant.platform.repository.OrderItemRepository;
import com.restaurant.platform.repository.PaymentRepository;
import com.restaurant.platform.repository.ProductRepository;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class OrderCancellationServiceTest {
    @ParameterizedTest
    @ValueSource(strings = {"PAID_AT", "COLLECTED_BY", "REFUNDED", "PARTIALLY_REFUNDED"})
    void everyCancellationGuardRejectsCollectedOrSettledEvidenceBeforeAnyWrites(String evidence) {
        var items = mock(OrderItemRepository.class);
        var payments = mock(PaymentRepository.class);
        var products = mock(ProductRepository.class);
        var service = new OrderCancellationService(items, payments, products);
        var order = new Order();
        order.setId(UUID.randomUUID());
        order.setRestaurantId(UUID.randomUUID());
        order.setStatus("PENDING");
        var payment = new Payment();
        payment.setStatus("PENDING");
        payment.setMethod("CASH_ON_DELIVERY");
        switch (evidence) {
            case "PAID_AT" -> payment.setPaidAt(OffsetDateTime.now());
            case "COLLECTED_BY" -> payment.setCollectedByUserId(UUID.randomUUID());
            default -> payment.setStatus(evidence);
        }
        when(payments.findByOrderIdOrderByCreatedAtDesc(order.getId())).thenReturn(List.of(payment));

        assertRefundRequired(() -> service.settleUnpaidOrder(order));
        assertRefundRequired(() -> service.requireUnpaid(order));
        assertRefundRequired(() -> service.closePendingCounterPayments(order));

        assertEquals("PENDING", order.getStatus());
        assertEquals(evidence.endsWith("REFUNDED") ? evidence : "PENDING", payment.getStatus());
        verify(payments, times(3)).findByOrderIdOrderByCreatedAtDesc(order.getId());
        verify(payments, never()).save(any());
        verifyNoInteractions(items, products);
    }

    private void assertRefundRequired(org.junit.jupiter.api.function.Executable operation) {
        var error = assertThrows(ApiException.class, operation);
        assertEquals(HttpStatus.CONFLICT, error.getStatus());
        assertEquals("REFUND_REQUIRED", error.getCode());
    }
}
