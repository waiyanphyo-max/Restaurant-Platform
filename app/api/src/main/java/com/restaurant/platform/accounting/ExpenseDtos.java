package com.restaurant.platform.accounting;

import jakarta.validation.constraints.*;
import com.fasterxml.jackson.annotation.JsonFormat;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public final class ExpenseDtos {
    private ExpenseDtos() { }
    public enum Category { RENT, SALARIES_WAGES, ELECTRICITY, WATER, INTERNET, TRANSPORT, PACKAGING, EQUIPMENT_MAINTENANCE, MARKETING, MISCELLANEOUS }
    public enum Method { CASH, BANK_TRANSFER, CARD, OTHER }
    public enum Frequency { MONTHLY, YEARLY }
    public enum Period { DAY, MONTH, YEAR }
    public record Create(@NotNull Category category, @NotNull @Positive Long amount,
                         @NotNull LocalDate expenseDate, @NotBlank @Size(max=2000) String description,
                         @Size(max=200) String payee, UUID receiptId) { }
    public record Pay(@NotNull @Positive Long amount, @NotNull Method method, @NotNull OffsetDateTime paidAt) { }
    public record Reason(@NotBlank @Size(max=2000) String reason) { }
    public record CreateTemplate(@NotNull Category category, @NotNull @Positive Long amount,
                                 @NotBlank @Size(max=2000) String description, @Size(max=200) String payee,
                                 @NotNull Frequency frequency, @NotNull LocalDate startsOn) { }
    public record Confirm(@NotNull LocalDate expenseDate) { }
    public record Template(UUID id, Category category, @JsonFormat(shape=JsonFormat.Shape.STRING) long amount, String description, String payee,
                           Frequency frequency, LocalDate startsOn, boolean active, UUID recordedBy, OffsetDateTime createdAt) { }
    public record Payment(UUID id, @JsonFormat(shape=JsonFormat.Shape.STRING) long amount, Method method, OffsetDateTime paidAt, UUID recordedBy,
                          OffsetDateTime createdAt, OffsetDateTime reversedAt, String reversalReason, UUID reversedBy) { }
    public record Expense(UUID id, Category category, @JsonFormat(shape=JsonFormat.Shape.STRING) long amount, LocalDate expenseDate, String description,
                          String payee, UUID receiptId, UUID templateId, @JsonFormat(shape=JsonFormat.Shape.STRING) long paidAmount, @JsonFormat(shape=JsonFormat.Shape.STRING) long outstandingAmount,
                          String paymentStatus, UUID recordedBy, OffsetDateTime createdAt,
                          OffsetDateTime cancelledAt, String cancellationReason, UUID cancelledBy) { }
    public record Detail(Expense expense, List<Payment> payments) { }
    public record Page<T>(List<T> items, long total, int page, int size) { }
    public record Total(LocalDate periodStart, Category category, @JsonFormat(shape=JsonFormat.Shape.STRING) long postedAmount, @JsonFormat(shape=JsonFormat.Shape.STRING) long cancelledAmount, @JsonFormat(shape=JsonFormat.Shape.STRING) long expenseAmount) { }
    public record Report(LocalDate from, LocalDate to, Period period, List<Total> totals) { }
}
