package com.restaurant.platform.accounting;

import com.restaurant.platform.common.error.ApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import java.time.*;
import java.util.UUID;
import java.util.function.Supplier;
import static com.restaurant.platform.accounting.ExpenseDtos.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ExpenseCashServiceTest {
    JdbcTemplate jdbc;
    AccountingSupport support;
    ExpenseService expenses;
    UUID restaurant=UUID.randomUUID(),actor=UUID.randomUUID(),expense=UUID.randomUUID();
    LocalDate today=LocalDate.of(2026,11,2);
    @BeforeEach void setUp() {
        jdbc=mock(JdbcTemplate.class);support=mock(AccountingSupport.class);expenses=spy(new ExpenseService(jdbc,support));
        when(support.write(restaurant)).thenReturn(actor);
        when(support.today(restaurant)).thenReturn(today);
        when(support.zone(restaurant)).thenReturn(ZoneId.of("Asia/Tokyo"));
        when(support.once(eq(restaurant),anyString(),anyString(),any(),any())).thenAnswer(call->{Supplier<UUID> action=call.getArgument(4);return action.get();});
    }
    Expense balance(long amount,long paid,OffsetDateTime cancelled) {
        return new Expense(expense,Category.RENT,amount,today,"November rent",null,null,null,paid,amount-paid,
                cancelled==null?"PARTIALLY_PAID":"CANCELLED",actor,OffsetDateTime.parse("2026-11-01T00:00:00Z"),cancelled,null,null);
    }
    @Test void rejectsPaymentAboveRemainingBalanceBeforeWritingFinancialRows() {
        doReturn(balance(1000,600,null)).when(expenses).get(restaurant,expense);
        ApiException error=assertThrows(ApiException.class,()->expenses.pay(restaurant,expense,"payment-1",new Pay(401L,Method.CASH,OffsetDateTime.parse("2026-11-01T23:00:00Z"))));
        assertEquals("EXPENSE_PAYMENT_EXCEEDS_BALANCE",error.getCode());verifyNoInteractions(jdbc);
    }
    @Test void cancelledExpensesCannotReceiveNewPayments() {
        doReturn(balance(1000,0,OffsetDateTime.parse("2026-11-01T00:00:00Z"))).when(expenses).get(restaurant,expense);
        assertThrows(ApiException.class,()->expenses.pay(restaurant,expense,"payment-2",new Pay(100L,Method.CARD,OffsetDateTime.parse("2026-11-01T12:00:00Z"))));
        verifyNoInteractions(jdbc);
    }
    @Test void cannotCancelAnExpenseUntilItsPaymentsAreExplicitlyReversed() {
        doReturn(balance(1000,200,null)).when(expenses).get(restaurant,expense);
        ApiException error=assertThrows(ApiException.class,()->expenses.cancel(restaurant,expense,"cancel-1",new Reason("Entered twice")));
        assertEquals("REVERSE_EXPENSE_PAYMENTS_FIRST",error.getCode());verifyNoInteractions(jdbc);
    }
    @Test void cashPaymentChecksRestaurantLocalDayBeforeAnyInsert() {
        doReturn(balance(1000,0,null)).when(expenses).get(restaurant,expense);
        doThrow(AccountingSupport.conflict("CASH_DAY_ALREADY_CLOSED")).when(support).assertOpenDay(restaurant,today);
        assertThrows(ApiException.class,()->expenses.pay(restaurant,expense,"payment-3",new Pay(100L,Method.CASH,OffsetDateTime.parse("2026-11-01T23:30:00Z"))));
        verify(support).assertOpenDay(restaurant,today);verifyNoInteractions(jdbc);
    }
    @Test void monthlyTemplateKeepsAnchorAcrossShortMonths() {
        LocalDate start=LocalDate.of(2026,1,31);
        assertTrue(ExpenseService.isOccurrence(start,Frequency.MONTHLY,LocalDate.of(2026,2,28)));
        assertTrue(ExpenseService.isOccurrence(start,Frequency.MONTHLY,LocalDate.of(2026,3,31)));
        assertFalse(ExpenseService.isOccurrence(start,Frequency.MONTHLY,LocalDate.of(2026,3,28)));
        assertFalse(ExpenseService.isOccurrence(start,Frequency.MONTHLY,LocalDate.of(2025,12,31)));
    }
    @Test void yearlyTemplateUsesCalendarYearAndPreservesLeapDayAnchor() {
        LocalDate start=LocalDate.of(2024,2,29);
        assertTrue(ExpenseService.isOccurrence(start,Frequency.YEARLY,LocalDate.of(2025,2,28)));
        assertTrue(ExpenseService.isOccurrence(start,Frequency.YEARLY,LocalDate.of(2028,2,29)));
        assertFalse(ExpenseService.isOccurrence(start,Frequency.YEARLY,LocalDate.of(2028,2,28)));
    }
    @Test void confirmingAnExplicitTemplateDoesNotDependOnTheCappedTemplateListing() {
        UUID template=UUID.randomUUID();
        Template row=new Template(template,Category.RENT,1000L,"Rent",null,Frequency.MONTHLY,today,true,actor,OffsetDateTime.parse("2026-11-01T00:00:00Z"));
        doReturn(java.util.List.of(row)).when(jdbc).query(contains("AND id=?"),org.mockito.ArgumentMatchers.<RowMapper<Template>>any(),eq(restaurant),eq(template));
        doReturn(balance(1000,0,null)).when(expenses).get(eq(restaurant),any(UUID.class));
        assertEquals(1000,expenses.confirmTemplate(restaurant,template,"confirm-template",new Confirm(today)).amount());
        verify(expenses,never()).templates(restaurant);
        verify(jdbc).query(contains("AND id=?"),org.mockito.ArgumentMatchers.<RowMapper<Template>>any(),eq(restaurant),eq(template));
    }
    @Test void cashPaymentReversalGuardsAndPersistsTheSameActualEventTimestamp() {
        UUID payment=UUID.randomUUID();
        Payment row=new Payment(payment,100L,Method.CASH,OffsetDateTime.now().minusHours(1),actor,OffsetDateTime.now().minusHours(1),null,null,null);
        doReturn(new Detail(balance(1000,100,null),java.util.List.of(row))).when(expenses).detail(restaurant,expense);
        OffsetDateTime before=OffsetDateTime.now();
        expenses.reversePayment(restaurant,expense,payment,"reverse-exact-event",new Reason("Returned cash"));
        OffsetDateTime after=OffsetDateTime.now();
        var occurredAt=org.mockito.ArgumentCaptor.forClass(OffsetDateTime.class);
        verify(jdbc).update(contains("created_at"),any(UUID.class),eq(restaurant),eq(payment),eq("Returned cash"),eq(actor),occurredAt.capture());
        assertFalse(occurredAt.getValue().isBefore(before));assertFalse(occurredAt.getValue().isAfter(after));
        verify(support).assertOpenDay(restaurant,occurredAt.getValue().atZoneSameInstant(ZoneId.of("Asia/Tokyo")).toLocalDate());
    }
    @Test void cashClosingRequiresAnInitialOrPreviousDayCount() {
        var cash=spy(new CashbookService(jdbc,support));
        doReturn(new CashbookDtos.Day(today,"Asia/Tokyo",null,100,0,0,0,0,0,null,null)).when(cash).day(restaurant,today);
        ApiException error=assertThrows(ApiException.class,()->cash.close(restaurant,"close-1",new CashbookDtos.Close(today,100L)));
        assertEquals("PREVIOUS_CASH_DAY_MUST_BE_CLOSED",error.getCode());verifyNoInteractions(jdbc);
    }
    @Test void cashMovementTypesHaveConsistentDirection() {
        assertThrows(ApiException.class,()->CashbookService.validateMovement(new CashbookDtos.Movement(CashbookDtos.Kind.BANK_DEPOSIT,CashbookDtos.Direction.IN,100L,OffsetDateTime.parse("2026-11-01T00:00:00Z"),"To bank")));
        assertDoesNotThrow(()->CashbookService.validateMovement(new CashbookDtos.Movement(CashbookDtos.Kind.BANK_DEPOSIT,CashbookDtos.Direction.OUT,100L,OffsetDateTime.parse("2026-11-01T00:00:00Z"),"To bank")));
    }
    @Test void missingHistoricalCashInputsRequireExplicitReconciliationAcknowledgement() {
        var cash=spy(new CashbookService(jdbc,support));
        doReturn(new CashbookDtos.Day(today,"Asia/Tokyo",100L,0,0,0,0,0,0,100L,null,java.util.List.of("Historical refund timestamp missing"))).when(cash).day(restaurant,today);
        ApiException error=assertThrows(ApiException.class,()->cash.close(restaurant,"close-gaps",new CashbookDtos.Close(today,100L)));
        assertEquals("CASH_RECONCILIATION_INPUTS_REQUIRED",error.getCode());verifyNoInteractions(jdbc);
        ApiException reason=assertThrows(ApiException.class,()->cash.close(restaurant,"close-gaps-reason",new CashbookDtos.Close(today,100L,true," ")));
        assertEquals("CORRECTION_REASON_REQUIRED",reason.getCode());verifyNoInteractions(jdbc);
    }
    @Test void cashReconciliationKeepsWholeCurrencyPrecisionAndRejectsOverflow() {
        assertEquals(9_007_199_254_741_099L,CashbookService.expected(9_007_199_254_740_999L,500,50,200,100,25,75));
        assertEquals(Long.MAX_VALUE,CashbookService.expected(Long.MAX_VALUE,1,0,1,0,0,0));
        assertThrows(ApiException.class,()->CashbookService.expected(Long.MAX_VALUE,1,0,0,0,0,0));
    }
}
