package com.restaurant.platform.accounting;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.entity.RestaurantSettings;
import com.restaurant.platform.repository.RestaurantSettingsRepository;
import com.restaurant.platform.security.RestaurantAuthorization;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import javax.sql.DataSource;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.Supplier;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Shared by the Docker migration suite and the explicitly configured disposable-local suite. */
public final class AccountingDatabaseChecks {
    private AccountingDatabaseChecks() { }
    public static void verify(DataSource dataSource) throws Exception {
        plansSuggestionsAndPurchaseSnapshots(dataSource);
        salesCashClosingAndReport(dataSource);
        concurrentRetriesAndTenantConstraints(dataSource);
        clientDatabaseAccessAndImmutableHistory(dataSource);
    }

    public static void plansSuggestionsAndPurchaseSnapshots(DataSource dataSource) {
        var f = new Fixture(dataSource);
        var item = f.item();
        var line = new ProcurementDtos.LineInput(item.id(), new BigDecimal("2.500000"), "kg", 100L, null);
        var sheet = f.tx(() -> f.purchases.saveSheet(f.restaurant, null, "plan", new ProcurementDtos.SheetInput(f.today, List.of(line), null)));
        assertEquals("PLANNED", sheet.status());
        assertEquals(0, f.count("accounting_purchases"));
        assertEquals(0, f.count("accounting_expenses"));
        assertEquals(0, f.purchases.items(f.restaurant, null, true, 0, 20).totalElements());
        var old = f.purchase(item.id(), f.today.minusDays(7), 100);
        assertEquals(250, old.purchase().totalAmount());
        assertEquals(0, f.purchases.items(f.restaurant, null, true, 0, 20).totalElements());
        var recent = f.purchase(item.id(), f.today.minusDays(6), 200);
        assertEquals(1, f.purchases.items(f.restaurant, null, true, 0, 20).totalElements());
        f.tx(() -> f.purchases.cancelPurchase(f.restaurant, recent.purchase().id(), "cancel-six", new ProcurementDtos.ReasonInput("Duplicate recorded purchase")));
        assertEquals(0, f.purchases.items(f.restaurant, null, true, 0, 20).totalElements());
        f.purchase(item.id(), f.today, 300);
        f.purchase(item.id(), f.today.minusDays(8), 998);
        var current = f.purchases.items(f.restaurant, null, true, 0, 20).content().getFirst();
        assertEquals(f.today, current.lastConfirmedPurchaseDate());
        assertEquals(300L, current.latestUnitCost());
        f.tx(() -> f.purchases.saveItem(f.restaurant, item.id(), "rename", new ProcurementDtos.ItemInput("Renamed rice", "kg", BigDecimal.ONE, null, true, "Rename catalog item")));
        var historical = f.purchases.purchase(f.restaurant, old.purchase().id());
        assertEquals("Rice", historical.lines().getFirst().itemName());
        assertEquals(100, historical.lines().getFirst().unitCost());
        assertEquals(250, historical.lines().getFirst().lineTotal());
        assertEquals(1, f.purchases.purchase(f.restaurant, recent.purchase().id()).cancellations().size());
        assertEquals(1, f.purchases.items(f.restaurant, "Renamed", false, 0, 20).totalElements());
    }

    public static void salesCashClosingAndReport(DataSource dataSource) {
        var f = new Fixture(dataSource);
        UUID order = f.order(1000, f.today.minusDays(1));
        UUID payment = f.payment(order, 600, "CASH_AT_COUNTER", "PAID", f.now.minusMinutes(20));
        f.payment(order, 400, "CASH_AT_COUNTER", "PAID", f.now.minusMinutes(20));
        UUID digital = f.order(700, f.today);
        f.payment(digital, 700, "ONLINE", "PAID", f.now.minusMinutes(19));
        UUID unpaid = f.order(300, f.today);
        f.payment(unpaid, 300, "CASH_AT_COUNTER", "PENDING", null);
        var summary = f.sales.summary(f.restaurant, f.today, f.today);
        assertEquals(1000, summary.netSales());
        assertEquals(1700, summary.collectedPayments());
        assertEquals(300, summary.outstandingPayments());
        var dashboard = f.sales.dashboard(f.restaurant, f.today.minusDays(1), YearMonth.from(f.today), f.today.getYear());
        assertEquals(1000, dashboard.today().netSales());
        assertEquals(1000, dashboard.selectedDay().netSales());
        assertEquals(YearMonth.from(f.today).lengthOfMonth(), dashboard.dailyTrend().size());
        assertEquals(12, dashboard.monthlyTrend().size());
        assertEquals("MMK", dashboard.currency());
        assertThrows(DataIntegrityViolationException.class, () -> f.payment(order, 1, "CASH_AT_COUNTER", "PAID", f.now.minusMinutes(18)));
        // Multiple item/payment rows must not multiply order totals.
        var yesterday = f.sales.summary(f.restaurant, f.today.minusDays(1), f.today.minusDays(1));
        assertEquals(1000, yesterday.netSales());
        assertEquals(1, yesterday.orders());
        f.jdbc.update("UPDATE public.products SET name='Current name',price=999999 WHERE restaurant_id=?", f.restaurant);
        var detail = f.sales.detail(f.restaurant, order);
        var historicalLine = detail.lines().stream().filter(line -> line.productName().equals("Historical product")).findFirst().orElseThrow();
        assertEquals(400, historicalLine.unitPrice());
        assertThrows(DataIntegrityViolationException.class, () -> f.jdbc.update("UPDATE public.order_items SET unit_price=99999 WHERE order_id=?", order));
        assertNotNull(detail.createdAt());
        assertEquals(f.actor, detail.payments().getFirst().collectedByUserId());
        assertThrows(DataIntegrityViolationException.class, () -> f.jdbc.update("UPDATE public.payments SET paid_at=? WHERE id=?", f.now, payment));
        assertThrows(DataIntegrityViolationException.class, () -> f.jdbc.update("UPDATE public.payments SET status='REFUNDED' WHERE id=?", payment));
        var refundRequest = new SalesDtos.RefundRequest(payment, 200, f.now.minusMinutes(10), "Returned item");
        var refund = f.tx(() -> f.sales.refund(f.restaurant, order, "refund-key", refundRequest));
        assertEquals(refund.id(), f.tx(() -> f.sales.refund(f.restaurant, order, "refund-key", refundRequest)).id());
        assertEquals(1, f.count("sales_refunds"));
        assertThrows(ApiException.class, () -> f.tx(() -> f.sales.refund(f.restaurant, order, "refund-over", new SalesDtos.RefundRequest(payment, 401, f.now.minusMinutes(9), "Too much"))));
        assertEquals(1, f.count("sales_refunds"));
        var item = f.item();
        var purchase = f.purchase(item.id(), f.today, 100);
        f.tx(() -> f.purchases.payPurchase(f.restaurant, purchase.purchase().id(), "pay-purchase", new ProcurementDtos.PaymentInput(50L, "CASH", f.now.minusMinutes(8))));
        var expense = f.tx(() -> f.expenses.create(f.restaurant, "expense", new ExpenseDtos.Create(ExpenseDtos.Category.ELECTRICITY, 100L, f.today, "Electricity", null, null)));
        f.tx(() -> f.expenses.pay(f.restaurant, expense.id(), "pay-expense", new ExpenseDtos.Pay(100L, ExpenseDtos.Method.CASH, f.now.minusMinutes(7))));
        f.tx(() -> f.cash.open(f.restaurant, "opening", new CashbookDtos.Opening(f.today, 500L, "Initial till count")));
        var day = f.cash.day(f.restaurant, f.today);
        assertEquals(1000, day.cashSalesReceived());
        assertEquals(200, day.cashRefundsPaid());
        assertEquals(1150L, day.expectedClosingCash());
        var close = f.tx(() -> f.cash.close(f.restaurant, "close", new CashbookDtos.Close(f.today, 1140L)));
        assertEquals(-10, close.variance());
        assertEquals(close.id(), f.tx(() -> f.cash.close(f.restaurant, "close", new CashbookDtos.Close(f.today, 1140L))).id());
        assertThrows(ApiException.class, () -> f.tx(() -> f.cash.close(f.restaurant, "second-close", new CashbookDtos.Close(f.today, 1140L))));
        assertThrows(ApiException.class, () -> f.tx(() -> f.cash.movement(f.restaurant, "late-move", new CashbookDtos.Movement(CashbookDtos.Kind.OWNER_DEPOSIT, CashbookDtos.Direction.IN, 1L, f.now.minusMinutes(1), "Late posting"))));
        assertThrows(DataIntegrityViolationException.class, () -> f.jdbc.update("UPDATE public.payments SET status='PAID',paid_at=? WHERE order_id=?", f.now.minusSeconds(1), unpaid));
        f.tx(() -> f.cash.reverseClosing(f.restaurant, close.id(), "reverse-close", new ExpenseDtos.Reason("Correct count")));
        var amended = f.tx(() -> f.cash.close(f.restaurant, "amended-close", new CashbookDtos.Close(f.today, 1150L)));
        assertEquals(2, amended.revision());
        assertEquals(2, f.cash.closings(f.restaurant, f.today, f.today, 0, 20).total());
        var report = f.reports.report(f.restaurant, f.today, f.today);
        assertEquals("CASH_FLOW_AND_EXPENSE_SUMMARY", report.reportType());
        assertNull(report.costOfGoodsSold()); assertNull(report.netOperatingProfit());
        assertEquals(1350, report.tradingPaymentNet());
        assertEquals(250, report.confirmedPurchases());
        assertEquals(100, report.registeredOperatingExpenses());
        var reversalRequest = new SalesDtos.ReversalRequest("Refund was recorded incorrectly; money restored");
        assertThrows(ApiException.class, () -> f.tx(() -> f.sales.reverseRefund(f.restaurant, order, refund.id(), "blocked-refund-reversal", reversalRequest)));
        f.tx(() -> f.cash.reverseClosing(f.restaurant, amended.id(), "reopen-for-refund-correction", new ExpenseDtos.Reason("Post correction with restored cash")));
        var reversal = f.tx(() -> f.sales.reverseRefund(f.restaurant, order, refund.id(), "refund-reversal", reversalRequest));
        assertEquals(reversal.id(), f.tx(() -> f.sales.reverseRefund(f.restaurant, order, refund.id(), "refund-reversal", reversalRequest)).id());
        assertThrows(ApiException.class, () -> f.tx(() -> f.sales.reverseRefund(f.restaurant, order, refund.id(), "second-refund-reversal", reversalRequest)));
        assertEquals(1, f.count("sales_refunds")); assertEquals(1, f.count("sales_refund_reversals"));
        assertEquals(200, f.cash.day(f.restaurant, f.today).otherReceipts());
        assertEquals(1350, f.cash.day(f.restaurant, f.today).expectedClosingCash());
        assertEquals(0, f.sales.summary(f.restaurant, f.today, f.today).refundedAmounts());
        var correctedDetail = f.sales.detail(f.restaurant, order);
        assertEquals(200, correctedDetail.refunds().getFirst().amount());
        assertEquals(1, correctedDetail.refundReversals().size());
        assertTrue(correctedDetail.timeline().stream().anyMatch(event -> event.type().equals("REFUND_REVERSAL")));
        f.tx(() -> f.sales.refund(f.restaurant, order, "new-refund-after-reversal", new SalesDtos.RefundRequest(payment, 600, OffsetDateTime.now(ZoneOffset.UTC), "Correct completed refund")));
        assertEquals(600, f.sales.summary(f.restaurant, f.today, f.today).refundedAmounts());
        UUID historicalOrder = f.order(100, f.today.minusDays(1));
        var historicalPaidAt = f.today.minusDays(1).atTime(10,0).atZone(ZoneId.of("Asia/Yangon")).toOffsetDateTime();
        UUID historicalPayment = f.payment(historicalOrder, 100, "ONLINE", "PAID", historicalPaidAt);
        var historicalRefund = f.tx(() -> f.sales.refund(f.restaurant, historicalOrder, "old-dated-refund", new SalesDtos.RefundRequest(historicalPayment, 50, historicalPaidAt.plusHours(1), "Original refund")));
        f.tx(() -> f.sales.reverseRefund(f.restaurant, historicalOrder, historicalRefund.id(), "old-refund-correction-today", reversalRequest));
        assertEquals(50, f.sales.summary(f.restaurant, f.today.minusDays(1), f.today.minusDays(1)).refundedAmounts());
        assertEquals(550, f.sales.summary(f.restaurant, f.today, f.today).refundedAmounts());
    }

    public static void concurrentRetriesAndTenantConstraints(DataSource dataSource) throws Exception {
        var f = new Fixture(dataSource);
        var input = new ProcurementDtos.SupplierInput("Supplier", "01234", true, null);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var first = pool.submit(() -> f.tx(() -> f.purchases.saveSupplier(f.restaurant, null, "same-key", input)));
            var second = pool.submit(() -> f.tx(() -> f.purchases.saveSupplier(f.restaurant, null, "same-key", input)));
            assertEquals(first.get(20, TimeUnit.SECONDS).id(), second.get(20, TimeUnit.SECONDS).id());
        }
        assertEquals(1, f.count("accounting_suppliers"));
        assertThrows(ApiException.class, () -> f.tx(() -> f.purchases.saveSupplier(f.restaurant, null, "same-key", new ProcurementDtos.SupplierInput("Changed", null, true, null))));
        var other = new Fixture(dataSource);
        var foreign = other.tx(() -> other.purchases.saveSupplier(other.restaurant, null, "foreign-supplier", input));
        assertThrows(ApiException.class, () -> f.tx(() -> f.purchases.saveItem(f.restaurant, null, "foreign-item", new ProcurementDtos.ItemInput("Foreign", "kg", null, foreign.id(), true, null))));
        assertThrows(DataIntegrityViolationException.class, () -> f.jdbc.update("INSERT INTO public.accounting_shopping_items(id,restaurant_id,name,default_unit,supplier_id,created_by,updated_by) VALUES(?,?,?,?,?,?,?)", UUID.randomUUID(), f.restaurant, "Cross tenant", "kg", foreign.id(), f.actor, f.actor));
        assertEquals(0, f.count("accounting_shopping_items"));
    }

    public static void clientDatabaseAccessAndImmutableHistory(DataSource dataSource) {
        var f = new Fixture(dataSource);
        var tables = f.jdbc.queryForList("""
                SELECT tablename FROM pg_tables WHERE schemaname='public'
                AND (tablename LIKE 'accounting_%' OR tablename LIKE 'sales_refund%')
                """, String.class);
        assertTrue(tables.size() >= 20);
        for (String table : tables) {
            assertEquals(Boolean.TRUE, f.jdbc.queryForObject("SELECT relrowsecurity FROM pg_class WHERE oid=CAST(? AS regclass)", Boolean.class, "public." + table), table);
            for (String role : List.of("anon", "authenticated")) {
                assertEquals(Boolean.FALSE, f.jdbc.queryForObject("SELECT has_table_privilege(?,?,'INSERT,UPDATE,DELETE')", Boolean.class, role, "public." + table), table);
            }
        }
        var expense = f.tx(() -> f.expenses.create(f.restaurant, "immutable", new ExpenseDtos.Create(ExpenseDtos.Category.RENT, 100L, f.today, "Rent", null, null)));
        assertThrows(DataIntegrityViolationException.class, () -> f.jdbc.update("UPDATE public.accounting_expenses SET amount=200 WHERE id=?", expense.id()));
        assertThrows(DataIntegrityViolationException.class, () -> f.jdbc.update("DELETE FROM public.accounting_audit WHERE restaurant_id=?", f.restaurant));
        assertEquals(100, f.expenses.get(f.restaurant, expense.id()).amount());
        assertThrows(DataIntegrityViolationException.class, () -> f.jdbc.update("UPDATE public.restaurant_settings SET currency='THB' WHERE restaurant_id=?", f.restaurant));
        assertThrows(DataIntegrityViolationException.class, () -> f.jdbc.update("UPDATE public.restaurant_settings SET timezone='UTC' WHERE restaurant_id=?", f.restaurant));
        assertEquals(1, f.jdbc.update("UPDATE public.restaurant_settings SET accepts_orders=false WHERE restaurant_id=?", f.restaurant));

        UUID template=f.tx(()->f.expenses.createTemplate(f.restaurant,"rent-template",new ExpenseDtos.CreateTemplate(ExpenseDtos.Category.RENT,200L,"Recurring rent",null,ExpenseDtos.Frequency.MONTHLY,f.today)));
        var occurrence=f.tx(()->f.expenses.confirmTemplate(f.restaurant,template,"confirm-rent",new ExpenseDtos.Confirm(f.today)));
        assertEquals(200,occurrence.amount());assertEquals("UNPAID",occurrence.paymentStatus());
        assertEquals(occurrence.id(),f.tx(()->f.expenses.confirmTemplate(f.restaurant,template,"confirm-rent",new ExpenseDtos.Confirm(f.today))).id());
        assertThrows(ApiException.class,()->f.tx(()->f.expenses.confirmTemplate(f.restaurant,template,"duplicate-occurrence",new ExpenseDtos.Confirm(f.today))));
        f.tx(()->f.expenses.cancel(f.restaurant,occurrence.id(),"cancel-occurrence",new ExpenseDtos.Reason("Duplicate obligation")));
        assertThrows(ApiException.class,()->f.tx(()->f.expenses.confirmTemplate(f.restaurant,template,"cancelled-occurrence",new ExpenseDtos.Confirm(f.today))));
        assertEquals("Duplicate obligation",f.expenses.detail(f.restaurant,occurrence.id()).expense().cancellationReason());
        f.tx(()->f.expenses.stopTemplate(f.restaurant,template,"stop-rent",new ExpenseDtos.Reason("Lease ended")));
        assertFalse(f.expenses.templates(f.restaurant).getFirst().active());

        f.tx(()->f.cash.open(f.restaurant,"cash-cutover",new CashbookDtos.Opening(f.today.minusDays(1),100L,"Consolidated starting cash")));
        var firstClose=f.tx(()->f.cash.close(f.restaurant,"cash-yesterday",new CashbookDtos.Close(f.today.minusDays(1),90L)));
        assertEquals(-10,firstClose.variance());
        assertEquals(90L,f.cash.day(f.restaurant,f.today).openingBalance());
        var secondClose=f.tx(()->f.cash.close(f.restaurant,"cash-today",new CashbookDtos.Close(f.today,90L)));
        assertThrows(ApiException.class,()->f.tx(()->f.cash.reverseClosing(f.restaurant,firstClose.id(),"reverse-too-early",new ExpenseDtos.Reason("Recount"))));
        assertThrows(ApiException.class,()->f.tx(()->f.cash.movement(f.restaurant,"backdated-cash",new CashbookDtos.Movement(CashbookDtos.Kind.OWNER_DEPOSIT,CashbookDtos.Direction.IN,1L,f.now.minusDays(1),"Late receipt"))));
        f.tx(()->f.cash.reverseClosing(f.restaurant,secondClose.id(),"reverse-latest",new ExpenseDtos.Reason("Recount")));
        f.tx(()->f.cash.reverseClosing(f.restaurant,firstClose.id(),"reverse-earlier",new ExpenseDtos.Reason("Recount")));
        assertEquals(2,f.cash.closings(f.restaurant,f.today.minusDays(1),f.today,0,20).items().stream().filter(c->c.reversedAt()!=null).count());
    }

    private static final class Fixture {
        final UUID restaurant = UUID.randomUUID(), actor = UUID.randomUUID();
        final LocalDate today = LocalDate.now(ZoneId.of("Asia/Yangon"));
        final OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        final JdbcTemplate jdbc;
        final TransactionTemplate transaction;
        final ProcurementService purchases;
        final SalesAccountingService sales;
        final ExpenseService expenses;
        final CashbookService cash;
        final FinancialReportService reports;
        Fixture(DataSource source) {
            jdbc = new JdbcTemplate(source); transaction = new TransactionTemplate(new DataSourceTransactionManager(source));
            jdbc.update("INSERT INTO auth.users(id) VALUES(?)", actor);
            jdbc.update("INSERT INTO public.restaurants(id,name,slug,township,city) VALUES(?,'Accounting test',?,'Bahan','Yangon')", restaurant, "accounting-" + restaurant);
            jdbc.update("INSERT INTO public.restaurant_settings(restaurant_id,common_qr_token) VALUES(?,?)", restaurant, UUID.randomUUID().toString());
            var authorization = mock(RestaurantAuthorization.class); when(authorization.requireAuthenticatedUserId()).thenReturn(actor);
            var settings = mock(RestaurantSettingsRepository.class); var record = new RestaurantSettings(); record.setRestaurantId(restaurant); record.setTimezone("Asia/Yangon");
            when(settings.findById(restaurant)).thenReturn(Optional.of(record));
            var support = new AccountingSupport(jdbc, authorization, settings);
            purchases = new ProcurementService(jdbc, support); sales = new SalesAccountingService(new NamedParameterJdbcTemplate(jdbc), support);
            expenses = new ExpenseService(jdbc, support); cash = new CashbookService(jdbc, support);
            reports = new FinancialReportService(support, new NamedParameterJdbcTemplate(jdbc), sales);
        }
        <T> T tx(Supplier<T> action) { return transaction.execute(status -> action.get()); }
        long count(String table) { return jdbc.queryForObject("SELECT count(*) FROM public." + table + " WHERE restaurant_id=?", Long.class, restaurant); }
        ProcurementDtos.Item item() { return tx(() -> purchases.saveItem(restaurant, null, "item", new ProcurementDtos.ItemInput("Rice", "kg", BigDecimal.ONE, null, true, null))); }
        ProcurementDtos.PurchaseDetail purchase(UUID item, LocalDate date, long cost) {
            return tx(() -> purchases.confirmPurchase(restaurant, UUID.randomUUID().toString(), new ProcurementDtos.PurchaseInput(date,
                    date.equals(today) ? now.minusMinutes(30) : date.atTime(12,0).atZone(ZoneId.of("Asia/Yangon")).toOffsetDateTime(), null,
                    List.of(new ProcurementDtos.LineInput(item, new BigDecimal("2.5"), "kg", cost, null)), null, null, null, null, null, null)));
        }
        UUID order(long amount, LocalDate date) {
            UUID order = UUID.randomUUID(), category = UUID.randomUUID(), product = UUID.randomUUID();
            jdbc.update("INSERT INTO public.categories(id,restaurant_id,name) VALUES(?,?,?)", category, restaurant, "Category " + category);
            jdbc.update("INSERT INTO public.products(id,restaurant_id,category_id,name,price) VALUES(?,?,?,'Menu product',5000)", product, restaurant, category);
            jdbc.update("""
                    INSERT INTO public.orders(id,restaurant_id,order_number,order_type,order_channel,status,subtotal,total_amount,created_at,created_by_user_id)
                    VALUES(?,?,?,'TAKEAWAY','STAFF','COMPLETED',?,?,?,?)
                    """, order, restaurant, "T-" + order.toString().substring(0,8), amount, amount, date.atStartOfDay(ZoneId.of("Asia/Yangon")).toOffsetDateTime(), actor);
            jdbc.update("""
                    INSERT INTO public.order_items(restaurant_id,order_id,product_id,product_name,unit_price,quantity,subtotal)
                    VALUES(?,?,?,'Historical product',?,1,?),(?,?,?,'Other historical line',?,1,?)
                    """, restaurant, order, product, amount*2/5,amount*2/5, restaurant, order, product,amount-amount*2/5,amount-amount*2/5);
            return order;
        }
        UUID payment(UUID order, long amount, String method, String status, OffsetDateTime paidAt) {
            UUID id = UUID.randomUUID(); jdbc.update("INSERT INTO public.payments(id,order_id,method,status,amount,paid_at,collected_by_user_id) VALUES(?,?,?,?,?,?,?)", id, order, method, status, amount, paidAt, paidAt == null ? null : actor); return id;
        }
    }
}
