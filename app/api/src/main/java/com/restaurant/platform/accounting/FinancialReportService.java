package com.restaurant.platform.accounting;

import com.fasterxml.jackson.annotation.JsonFormat;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDate;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/** Provides verifiable receipts/expenses; it deliberately does not invent inventory consumption. */
@Service
@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
public class FinancialReportService {
    private final AccountingSupport support;
    private final NamedParameterJdbcTemplate jdbc;
    private final SalesAccountingService sales;
    public FinancialReportService(AccountingSupport support, NamedParameterJdbcTemplate jdbc, SalesAccountingService sales) {
        this.support = support; this.jdbc = jdbc; this.sales = sales;
    }

    public Report report(UUID restaurantId, LocalDate from, LocalDate to) {
        support.read(restaurantId);
        var period = support.range(restaurantId, from, to);
        var parameters = new MapSqlParameterSource("restaurant", restaurantId)
                .addValue("from", period.from()).addValue("to", period.to())
                .addValue("start", period.start()).addValue("end", period.end());
        var revenue = sales.summary(restaurantId, period.from(), period.to());
        long purchases = sum("""
                SELECT COALESCE(SUM(p.total_amount),0) FROM public.accounting_purchases p
                WHERE p.restaurant_id=:restaurant AND p.purchase_date BETWEEN :from AND :to
                AND NOT EXISTS (SELECT 1 FROM public.accounting_purchase_cancellations c
                    WHERE c.restaurant_id=p.restaurant_id AND c.purchase_id=p.id)
                """, parameters);
        long purchasePayments = payments("purchase", parameters);
        long expensePayments = payments("expense", parameters);
        var categories = jdbc.query("""
                SELECT e.category,COALESCE(SUM(e.amount),0) amount FROM public.accounting_expenses e
                WHERE e.restaurant_id=:restaurant AND e.expense_date BETWEEN :from AND :to
                AND NOT EXISTS (SELECT 1 FROM public.accounting_expense_cancellations c
                  WHERE c.restaurant_id=e.restaurant_id AND c.expense_id=e.id)
                GROUP BY e.category ORDER BY e.category
                """, parameters, (rs, n) -> new ExpenseCategory(rs.getString("category"), AccountingSupport.whole(rs.getBigDecimal("amount"))));
        BigDecimal expenseTotal = BigDecimal.ZERO;
        for (var category : categories) expenseTotal = expenseTotal.add(BigDecimal.valueOf(category.amount()));
        long expenses = AccountingSupport.whole(expenseTotal);
        long movement = AccountingSupport.whole(BigDecimal.valueOf(revenue.collectedPayments()).subtract(BigDecimal.valueOf(revenue.refundedAmounts()))
                .subtract(BigDecimal.valueOf(purchasePayments)).subtract(BigDecimal.valueOf(expensePayments)));
        return new Report(restaurantId, period.from(), period.to(), support.zone(restaurantId).getId(), support.currency(restaurantId), "CASH_FLOW_AND_EXPENSE_SUMMARY",
                revenue, purchases, expenses, purchasePayments, expensePayments, movement, categories,
                null, null, null,
                List.of("Verified cost of goods sold is unavailable: no opening/closing inventory valuation, purchase-to-consumption allocation, or recipe/yield costing is recorded.",
                        "Gross profit and net operating profit are unavailable. Purchases are not treated as goods consumed.",
                        "Sales use order-creation cohorts and current cancellation state, not an accrual recognition policy. Registered expenses and purchases are restated for recorded cancellations; their original and reversal records remain in history.",
                        "Trading payment net includes cash and noncash sales collections less dated refunds and net purchase/expense payments. It excludes other cash movements and is not profit.",
                        "Legacy refunded payments without an authoritative refund timestamp are excluded from dated refund outflows and can make historical payment summaries incomplete."));
    }

    public String export(UUID restaurantId, LocalDate from, LocalDate to) {
        var report = report(restaurantId, from, to);
        var sales = report.sales();
        var csv = new StringBuilder("section,metric,value\r\n");
        row(csv, "period", "From", report.from());
        row(csv, "period", "Through", report.to());
        row(csv, "period", "Timezone", report.timezone());
        row(csv, "period", "Whole currency", report.currency());
        row(csv, "sales", "Gross sales", sales.grossSales());
        row(csv, "sales", "Discounts", sales.discounts());
        row(csv, "sales", "Net sales", sales.netSales());
        row(csv, "sales", "Collected payments", sales.collectedPayments());
        row(csv, "sales", "Outstanding for these orders", sales.outstandingPayments());
        row(csv, "sales", "Dated refunds net of reversals", sales.refundedAmounts());
        row(csv, "sales", "Legacy refunds missing an event time", sales.legacyRefundsWithoutEventTime());
        row(csv, "sales", "Orders", sales.orders());
        row(csv, "sales", "Cancelled orders", sales.cancelledOrders());
        row(csv, "sales", "Products sold", sales.productsSold());
        row(csv, "summary", "Confirmed purchases", report.confirmedPurchases());
        row(csv, "summary", "Registered operating expenses", report.registeredOperatingExpenses());
        row(csv, "summary", "Purchase payments net of reversals", report.purchasePayments());
        row(csv, "summary", "Expense payments net of reversals", report.expensePayments());
        row(csv, "summary", "Trading payment net (cash and noncash)", report.tradingPaymentNet());
        for (var expense : report.expensesByCategory()) row(csv, "expense category", expense.category(), expense.amount());
        for (var limitation : report.missingInputs()) row(csv, "note", "Accounting scope", limitation);
        return csv.toString();
    }

    private static void row(StringBuilder csv, String section, String metric, Object value) {
        csv.append(AccountingSupport.csv(section)).append(',').append(AccountingSupport.csv(metric)).append(',')
                .append(value instanceof Long ? value : AccountingSupport.csv(value)).append("\r\n");
    }

    // The domain name is a fixed internal constant, never request input.
    private long payments(String domain, MapSqlParameterSource parameters) {
        return sum("""
                SELECT COALESCE((SELECT SUM(p.amount) FROM public.accounting_%s_payments p
                  WHERE p.restaurant_id=:restaurant AND p.paid_at>=:start AND p.paid_at<:end),0)
                - COALESCE((SELECT SUM(p.amount) FROM public.accounting_%s_payment_reversals r
                  JOIN public.accounting_%s_payments p ON p.id=r.payment_id AND p.restaurant_id=r.restaurant_id
                  WHERE r.restaurant_id=:restaurant AND r.created_at>=:start AND r.created_at<:end),0)
                """.formatted(domain, domain, domain), parameters);
    }
    private long sum(String sql, MapSqlParameterSource parameters) { return AccountingSupport.whole(jdbc.queryForObject(sql, parameters, java.math.BigDecimal.class)); }

    public record ExpenseCategory(String category, @JsonFormat(shape = JsonFormat.Shape.STRING) long amount) { }
    public record Report(UUID restaurantId, LocalDate from, LocalDate to, String timezone, String currency, String reportType,
            SalesDtos.Summary sales,
            @JsonFormat(shape = JsonFormat.Shape.STRING) long confirmedPurchases,
            @JsonFormat(shape = JsonFormat.Shape.STRING) long registeredOperatingExpenses,
            @JsonFormat(shape = JsonFormat.Shape.STRING) long purchasePayments,
            @JsonFormat(shape = JsonFormat.Shape.STRING) long expensePayments,
            @JsonFormat(shape = JsonFormat.Shape.STRING) long tradingPaymentNet,
            List<ExpenseCategory> expensesByCategory, Long costOfGoodsSold, Long grossProfit, Long netOperatingProfit, List<String> missingInputs) { }
}
