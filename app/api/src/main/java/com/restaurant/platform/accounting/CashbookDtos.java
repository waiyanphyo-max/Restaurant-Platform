package com.restaurant.platform.accounting;

import jakarta.validation.constraints.*;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public final class CashbookDtos {
    private CashbookDtos() { }
    public enum Kind { OTHER_RECEIPT, OWNER_DEPOSIT, OWNER_WITHDRAWAL, BANK_DEPOSIT, BANK_WITHDRAWAL, ADJUSTMENT }
    public enum Direction { IN, OUT }
    public record Opening(@NotNull LocalDate date, @NotNull @PositiveOrZero Long amount, @NotBlank @Size(max=2000) String reason) { }
    public record Movement(@NotNull Kind kind, @NotNull Direction direction, @NotNull @Positive Long amount,
                           @NotNull OffsetDateTime occurredAt, @NotBlank @Size(max=2000) String reason) { }
    public record Close(@NotNull LocalDate date, @NotNull @PositiveOrZero Long actualCash,
                        Boolean acknowledgeMissingInputs, @Size(max=2000) String reconciliationReason,
                        @JsonInclude(JsonInclude.Include.NON_NULL) Long expectedCash) {
        public Close(LocalDate date,Long actualCash) { this(date,actualCash,false,null,null); }
        public Close(LocalDate date, Long actualCash, Boolean acknowledgeMissingInputs, String reconciliationReason) {
            this(date, actualCash, acknowledgeMissingInputs, reconciliationReason, null);
        }
    }
    public record Closing(UUID id, LocalDate date, int revision, @JsonFormat(shape=JsonFormat.Shape.STRING) long openingBalance, @JsonFormat(shape=JsonFormat.Shape.STRING) long expectedCash,
                          @JsonFormat(shape=JsonFormat.Shape.STRING) long actualCash, @JsonFormat(shape=JsonFormat.Shape.STRING) long variance, UUID responsibleMember, OffsetDateTime closedAt,
                          OffsetDateTime reversedAt, String reversalReason, UUID reversedBy,
                          String reconciliationNote) { }
    public record Day(LocalDate date, String timezone, @JsonFormat(shape=JsonFormat.Shape.STRING) Long openingBalance, @JsonFormat(shape=JsonFormat.Shape.STRING) long cashSalesReceived,
                      @JsonFormat(shape=JsonFormat.Shape.STRING) long cashRefundsPaid, @JsonFormat(shape=JsonFormat.Shape.STRING) long cashPurchasePayments, @JsonFormat(shape=JsonFormat.Shape.STRING) long cashExpensePayments,
                      @JsonFormat(shape=JsonFormat.Shape.STRING) long otherReceipts, @JsonFormat(shape=JsonFormat.Shape.STRING) long otherPayments, @JsonFormat(shape=JsonFormat.Shape.STRING) Long expectedClosingCash, Closing closing,
                      List<String> missingInputs) {
        public Day(LocalDate date,String timezone,Long openingBalance,long cashSalesReceived,long cashRefundsPaid,long cashPurchasePayments,long cashExpensePayments,long otherReceipts,long otherPayments,Long expectedClosingCash,Closing closing) {
            this(date,timezone,openingBalance,cashSalesReceived,cashRefundsPaid,cashPurchasePayments,cashExpensePayments,otherReceipts,otherPayments,expectedClosingCash,closing,List.of());
        }
    }
    public record Transaction(UUID id, String source, UUID sourceId, OffsetDateTime occurredAt,
                              @JsonFormat(shape=JsonFormat.Shape.STRING) long signedAmount, UUID recordedBy, String description) { }
    public record Page<T>(List<T> items, long total, int page, int size) { }
    public record Id(UUID id) { }
}
