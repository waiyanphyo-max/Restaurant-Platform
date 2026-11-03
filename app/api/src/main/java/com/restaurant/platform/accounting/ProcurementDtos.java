package com.restaurant.platform.accounting;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import com.fasterxml.jackson.annotation.JsonFormat;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** Whole-currency prices; decimal quantities are supported only when the line total is whole currency. */
public final class ProcurementDtos {
    private ProcurementDtos() { }
    public enum SupplierSort { NAME_ASC, NAME_DESC }
    public enum ShoppingItemSort { NAME_ASC, NAME_DESC, LAST_PURCHASE_DESC }
    public enum PurchaseSort { NEWEST, OLDEST, TOTAL_DESC }
    public enum PayableSort { NAME_ASC, OUTSTANDING_DESC, DUE_ASC }

    public record Page<T>(List<T> content, long totalElements, int page, int size) { }
    public record SupplierInput(@NotBlank @Size(max=150) String name, @Size(max=500) String contact,
                                boolean active, @Size(max=1000) String reason) { }
    public record Supplier(UUID id, String name, String contact, boolean active, UUID createdBy,
                           OffsetDateTime createdAt, UUID updatedBy, OffsetDateTime updatedAt) { }
    public record ItemInput(@NotBlank @Size(max=150) String name, @NotBlank @Size(max=30) String defaultUnit,
                            @JsonFormat(shape=JsonFormat.Shape.STRING) @DecimalMin(value="0",inclusive=false) @Digits(integer=12,fraction=6) BigDecimal defaultQuantity,
                            UUID supplierId, boolean suggestionEnabled, @Size(max=1000) String reason) { }
    public record Item(UUID id, String name, String defaultUnit, @JsonFormat(shape=JsonFormat.Shape.STRING) BigDecimal defaultQuantity, UUID supplierId,
                       boolean suggestionEnabled, @JsonFormat(shape=JsonFormat.Shape.STRING) Long latestUnitCost, String latestCostUnit, LocalDate lastConfirmedPurchaseDate,
                       boolean suggested, UUID createdBy, OffsetDateTime createdAt, UUID updatedBy, OffsetDateTime updatedAt) { }
    public record LineInput(@NotNull UUID itemId,
                            @JsonFormat(shape=JsonFormat.Shape.STRING) @NotNull @DecimalMin(value="0",inclusive=false) @Digits(integer=12,fraction=6) BigDecimal quantity,
                            @NotBlank @Size(max=30) String unit, @JsonFormat(shape=JsonFormat.Shape.STRING) @NotNull @PositiveOrZero Long unitCost, UUID supplierId) { }
    public record SheetInput(@NotNull LocalDate shoppingDate, @NotEmpty @Size(max=200) List<@Valid LineInput> lines,
                             @Size(max=1000) String reason) { }
    public record Line(UUID id, UUID itemId, String itemName, @JsonFormat(shape=JsonFormat.Shape.STRING) BigDecimal quantity, String unit,
                       @JsonFormat(shape=JsonFormat.Shape.STRING) long unitCost, @JsonFormat(shape=JsonFormat.Shape.STRING) long lineTotal, UUID supplierId) { }
    public record Sheet(UUID id, LocalDate shoppingDate, String status, String paymentStatus, UUID purchaseId,
                        List<Line> lines, UUID createdBy, OffsetDateTime createdAt, UUID updatedBy, OffsetDateTime updatedAt) { }
    public record PurchaseInput(@NotNull LocalDate purchaseDate, @NotNull OffsetDateTime purchasedAt, UUID supplierId,
                                @NotEmpty @Size(max=200) List<@Valid LineInput> lines, UUID sheetId,
                                LocalDate dueDate, UUID receiptId, @Size(max=150) String invoiceReference,
                                UUID correctionOfId, @Size(max=1000) String correctionReason) { }
    public record PurchaseSummary(UUID id, LocalDate purchaseDate, OffsetDateTime purchasedAt, UUID supplierId,
                                  String supplierName, @JsonFormat(shape=JsonFormat.Shape.STRING) long totalAmount, @JsonFormat(shape=JsonFormat.Shape.STRING) long amountPaid, @JsonFormat(shape=JsonFormat.Shape.STRING) long outstandingAmount,
                                  String paymentStatus, String status, LocalDate dueDate, String invoiceReference,
                                  UUID receiptId, UUID correctionOfId, UUID createdBy, OffsetDateTime createdAt) { }
    public record PaymentInput(@JsonFormat(shape=JsonFormat.Shape.STRING) @NotNull @Positive Long amount, @NotBlank String method, @NotNull OffsetDateTime paidAt) { }
    public record Payment(UUID id, @JsonFormat(shape=JsonFormat.Shape.STRING) long amount, String method, OffsetDateTime paidAt, UUID createdBy,
                          OffsetDateTime createdAt, UUID reversalId, String reversalReason,
                          UUID reversedBy, OffsetDateTime reversedAt) { }
    public record Adjustment(UUID id, String reason, UUID createdBy, OffsetDateTime createdAt) { }
    public record PurchaseDetail(PurchaseSummary purchase, List<Line> lines, List<Payment> payments,
                                 List<Adjustment> cancellations, List<UUID> corrections) { }
    public record ReasonInput(@NotBlank @Size(max=1000) String reason) { }
    public record PurchaseReport(LocalDate from, LocalDate to, @JsonFormat(shape=JsonFormat.Shape.STRING) long confirmedTotal, @JsonFormat(shape=JsonFormat.Shape.STRING) long cancelledTotal,
                                 long purchaseCount, List<MonthlyTotal> monthlyTotals) { }
    public record MonthlyTotal(LocalDate month, @JsonFormat(shape=JsonFormat.Shape.STRING) long confirmedTotal, long purchaseCount) { }
    public record Payable(UUID supplierId, String supplierName, @JsonFormat(shape=JsonFormat.Shape.STRING) long confirmedObligations, @JsonFormat(shape=JsonFormat.Shape.STRING) long amountPaid,
                          @JsonFormat(shape=JsonFormat.Shape.STRING) long outstandingAmount, LocalDate earliestUnpaidDueDate) { }
    public record SupplierPayment(UUID purchaseId, String invoiceReference, Payment payment) { }
}
