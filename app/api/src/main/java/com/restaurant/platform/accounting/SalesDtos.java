package com.restaurant.platform.accounting;

import jakarta.validation.constraints.*;
import com.fasterxml.jackson.annotation.JsonFormat;
import java.time.*;
import java.util.*;

/** Monetary values are exact whole currency units. No price is read from the live menu. */
public final class SalesDtos {
    private SalesDtos() { }
    public record Summary(LocalDate from, LocalDate to, @JsonFormat(shape=JsonFormat.Shape.STRING) long grossSales,
            @JsonFormat(shape=JsonFormat.Shape.STRING) long discounts, @JsonFormat(shape=JsonFormat.Shape.STRING) long netSales,
            @JsonFormat(shape=JsonFormat.Shape.STRING) long collectedPayments, @JsonFormat(shape=JsonFormat.Shape.STRING) long outstandingPayments,
            @JsonFormat(shape=JsonFormat.Shape.STRING) long refundedAmounts, long orders, long cancelledOrders, long productsSold,
            @JsonFormat(shape=JsonFormat.Shape.STRING) long legacyRefundsWithoutEventTime) { }
    public record Trend(String period, @JsonFormat(shape=JsonFormat.Shape.STRING) long grossSales,
            @JsonFormat(shape=JsonFormat.Shape.STRING) long discounts, @JsonFormat(shape=JsonFormat.Shape.STRING) long netSales, long orders, long productsSold) { }
    public record Product(UUID productId, String historicalName, long quantity,
            @JsonFormat(shape=JsonFormat.Shape.STRING) long lineSalesBeforeOrderDiscounts) { }
    public record Dashboard(String timezone, String currency, Summary today, Summary selectedDay, Summary selectedMonth,
            Summary selectedYear, List<Trend> dailyTrend, List<Trend> monthlyTrend, List<Product> topProducts,
            Map<String, String> definitions, List<String> missingInputs) { }
    public record Modifier(UUID optionId, String name, @JsonFormat(shape=JsonFormat.Shape.STRING) long additionalPrice, int quantity) { }
    public record Line(UUID id, UUID productId, String productName, UUID variantId, String variantName,
            int quantity, @JsonFormat(shape=JsonFormat.Shape.STRING) long unitPrice, @JsonFormat(shape=JsonFormat.Shape.STRING) long lineDiscount,
            @JsonFormat(shape=JsonFormat.Shape.STRING) long lineTotal, List<Modifier> modifiers) { }
    public record PaymentRow(UUID id, String method, String status, @JsonFormat(shape=JsonFormat.Shape.STRING) long amount, OffsetDateTime paidAt,
            UUID collectedByUserId, OffsetDateTime createdAt) { }
    public record Refund(UUID id, UUID orderId, UUID paymentId, @JsonFormat(shape=JsonFormat.Shape.STRING) long amount, String method,
            OffsetDateTime refundedAt, UUID createdBy, OffsetDateTime createdAt, String reason) { }
    public record RefundReversal(UUID id, UUID orderId, UUID refundId, @JsonFormat(shape=JsonFormat.Shape.STRING) long amount,
            String method, UUID createdBy, OffsetDateTime createdAt, String reason) { }
    public record Event(String type, OffsetDateTime timestamp, UUID actor, @JsonFormat(shape=JsonFormat.Shape.STRING) Long amount, String description) { }
    public record LedgerOrder(UUID id, String orderNumber, OffsetDateTime createdAt, UUID createdByUserId,
            String orderChannel, String orderType, String status, UUID tableId, String tableNumber,
            UUID queueTicketId, String queueDisplayCode, @JsonFormat(shape=JsonFormat.Shape.STRING) long subtotal,
            @JsonFormat(shape=JsonFormat.Shape.STRING) long deliveryFee, @JsonFormat(shape=JsonFormat.Shape.STRING) long discountAmount,
            @JsonFormat(shape=JsonFormat.Shape.STRING) long totalAmount, String paymentStatus, List<Line> lines, List<PaymentRow> payments,
            List<Refund> refunds, List<RefundReversal> refundReversals, List<Event> timeline) { }
    public record LedgerPage<T>(List<T> content, int page, int size, long totalElements) { }
    public record RefundRequest(@NotNull UUID paymentId, @Positive long amount,
            @NotNull OffsetDateTime refundedAt, @NotBlank @Size(max=1000) String reason) { }
    public record ReversalRequest(@NotBlank @Size(max=1000) String reason) { }
}
