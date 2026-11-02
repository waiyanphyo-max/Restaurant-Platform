package com.restaurant.platform.accounting;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Isolation;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.*;
import java.math.BigDecimal;
import java.util.*;
import static com.restaurant.platform.accounting.AccountingSupport.*;
import static com.restaurant.platform.accounting.CashbookDtos.*;

/** Cash movements are independently aggregated; unpaid and digital entries never enter this ledger. */
@Service
@Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
public class CashbookService {
    private final JdbcTemplate jdbc;
    private final AccountingSupport support;
    public CashbookService(JdbcTemplate jdbc,AccountingSupport support) {this.jdbc=jdbc;this.support=support;}

    private static final String TRANSACTIONS="""
        SELECT p.id,'SALE_RECEIPT' source,p.order_id source_id,p.paid_at occurred_at,p.amount signed_amount,
          p.collected_by_user_id recorded_by,'Order payment' description,o.restaurant_id
        FROM public.payments p JOIN public.orders o ON o.id=p.order_id
        WHERE p.status IN ('PAID','REFUNDED') AND p.method IN ('CASH_AT_COUNTER','CASH_ON_DELIVERY') AND p.paid_at IS NOT NULL
        UNION ALL
        SELECT r.id,'SALE_REFUND',r.order_id,r.refunded_at,-r.amount,r.created_by,r.reason,r.restaurant_id
        FROM public.sales_refunds r WHERE r.method IN ('CASH_AT_COUNTER','CASH_ON_DELIVERY')
        UNION ALL
        SELECT v.id,'SALE_REFUND_REVERSAL',r.order_id,v.created_at,r.amount,v.created_by,v.reason,v.restaurant_id
        FROM public.sales_refund_reversals v JOIN public.sales_refunds r
          ON r.restaurant_id=v.restaurant_id AND r.id=v.refund_id WHERE r.method IN ('CASH_AT_COUNTER','CASH_ON_DELIVERY')
        UNION ALL
        SELECT p.id,'PURCHASE_PAYMENT',p.purchase_id,p.paid_at,-p.amount,p.created_by,'Purchase payment',p.restaurant_id
        FROM public.accounting_purchase_payments p WHERE p.method='CASH'
        UNION ALL
        SELECT r.id,'PURCHASE_PAYMENT_REVERSAL',p.purchase_id,r.created_at,p.amount,r.created_by,r.reason,r.restaurant_id
        FROM public.accounting_purchase_payment_reversals r JOIN public.accounting_purchase_payments p
          ON p.restaurant_id=r.restaurant_id AND p.id=r.payment_id WHERE p.method='CASH'
        UNION ALL
        SELECT p.id,'EXPENSE_PAYMENT',p.expense_id,p.paid_at,-p.amount,p.created_by,'Expense payment',p.restaurant_id
        FROM public.accounting_expense_payments p WHERE p.method='CASH'
        UNION ALL
        SELECT r.id,'EXPENSE_PAYMENT_REVERSAL',p.expense_id,r.created_at,p.amount,r.created_by,r.reason,r.restaurant_id
        FROM public.accounting_expense_payment_reversals r JOIN public.accounting_expense_payments p
          ON p.restaurant_id=r.restaurant_id AND p.id=r.payment_id WHERE p.method='CASH'
        UNION ALL
        SELECT m.id,m.kind,m.id,m.occurred_at,m.signed_amount,m.created_by,m.reason,m.restaurant_id
        FROM public.accounting_cash_movements m
        UNION ALL
        SELECT r.id,'MOVEMENT_REVERSAL',m.id,r.created_at,-m.signed_amount,r.created_by,r.reason,r.restaurant_id
        FROM public.accounting_cash_movement_reversals r JOIN public.accounting_cash_movements m
          ON m.restaurant_id=r.restaurant_id AND m.id=r.movement_id
        """;
    private static final String CLOSINGS="""
        SELECT c.*,r.created_at reversed_at,r.reason reversal_reason,r.created_by reversed_by
        FROM public.accounting_cash_closings c LEFT JOIN public.accounting_cash_closing_reversals r
          ON r.restaurant_id=c.restaurant_id AND r.closing_id=c.id
        """;
    private static final RowMapper<Closing> CLOSING_MAPPER=(rs,n)->closing(rs);
    private static Closing closing(ResultSet rs) throws SQLException {
        return new Closing(rs.getObject("id",UUID.class),rs.getObject("closing_date",LocalDate.class),rs.getInt("revision"),
          rs.getLong("opening_balance"),rs.getLong("expected_cash"),rs.getLong("actual_cash"),rs.getLong("variance"),
          rs.getObject("created_by",UUID.class),rs.getObject("created_at",OffsetDateTime.class),
          rs.getObject("reversed_at",OffsetDateTime.class),rs.getString("reversal_reason"),rs.getObject("reversed_by",UUID.class),rs.getString("reconciliation_note"));
    }
    public Day day(UUID restaurant,LocalDate requestedDate) {
        support.read(restaurant);
        LocalDate date=requestedDate==null?support.today(restaurant):requestedDate;
        if(date.isAfter(support.today(restaurant)))throw invalid("FUTURE_CASHBOOK_DATE");
        var range=support.range(restaurant,date,date);
        Long opening=openingBalance(restaurant,date);
        var totals=jdbc.query("""
          SELECT source,SUM(signed_amount)::numeric amount FROM (%s) t
          WHERE restaurant_id=? AND occurred_at>=? AND occurred_at<? GROUP BY source
          """.formatted(TRANSACTIONS),(rs,n)->Map.entry(rs.getString("source"),whole(rs.getBigDecimal("amount"))),restaurant,range.start(),range.end());
        long sales=0,refund=0,purchases=0,expenses=0,otherIn=0,otherOut=0;
        // Aggregate inflows and outflows individually: opposite adjustments must stay visible.
        for(var total:totals) {
            switch(total.getKey()) {
                case "SALE_RECEIPT"->sales=total.getValue();
                case "SALE_REFUND"->refund=Math.negateExact(total.getValue());
                case "PURCHASE_PAYMENT"->purchases=Math.negateExact(total.getValue());
                case "EXPENSE_PAYMENT"->expenses=Math.negateExact(total.getValue());
                default->{ /* Other movements are summed by sign below. */ }
            }
        }
        var other=jdbc.queryForObject("""
          SELECT COALESCE(SUM(signed_amount) FILTER(WHERE signed_amount>0),0)::numeric receipts,
            COALESCE(-SUM(signed_amount) FILTER(WHERE signed_amount<0),0)::numeric payments FROM (%s) t
          WHERE restaurant_id=? AND occurred_at>=? AND occurred_at<?
          AND source NOT IN ('SALE_RECEIPT','SALE_REFUND','PURCHASE_PAYMENT','EXPENSE_PAYMENT')
          """.formatted(TRANSACTIONS),(rs,n)->new long[]{whole(rs.getBigDecimal("receipts")),whole(rs.getBigDecimal("payments"))},restaurant,range.start(),range.end());
        if(other!=null){otherIn=other[0];otherOut=other[1];}
        Long expected=opening==null?null:expected(opening,sales,refund,purchases,expenses,otherIn,otherOut);
        Closing current=jdbc.query(CLOSINGS+" WHERE c.restaurant_id=? AND c.closing_date=? AND r.id IS NULL ORDER BY c.revision DESC LIMIT 1",CLOSING_MAPPER,restaurant,date).stream().findFirst().orElse(null);
        return new Day(date,support.zone(restaurant).getId(),opening,sales,refund,purchases,expenses,otherIn,otherOut,expected,current,missingInputs(restaurant));
    }
    private List<String> missingInputs(UUID restaurant) {
        var result=new ArrayList<String>();
        Long missingTimestamps=jdbc.queryForObject("""
          SELECT COUNT(*) FROM public.payments p JOIN public.orders o ON o.id=p.order_id
          WHERE o.restaurant_id=? AND p.method IN ('CASH_AT_COUNTER','CASH_ON_DELIVERY')
          AND p.status IN ('PAID','REFUNDED') AND p.paid_at IS NULL
          """,Long.class,restaurant);
        if(missingTimestamps!=null&&missingTimestamps>0)result.add("Historical cash payments lack a payment timestamp ("+missingTimestamps+"); their receipt days cannot be reconstructed.");
        Long missingRefunds=jdbc.queryForObject("""
          SELECT COUNT(*) FROM public.payments p JOIN public.orders o ON o.id=p.order_id
          WHERE o.restaurant_id=? AND p.method IN ('CASH_AT_COUNTER','CASH_ON_DELIVERY') AND p.status='REFUNDED'
          AND COALESCE((SELECT SUM(r.amount) FROM public.sales_refunds r WHERE r.restaurant_id=o.restaurant_id AND r.payment_id=p.id),0)<>p.amount
          """,Long.class,restaurant);
        if(missingRefunds!=null&&missingRefunds>0)result.add("Historical refunded cash payments lack complete refund event records ("+missingRefunds+"); refund amounts and dates require source reconciliation.");
        return List.copyOf(result);
    }
    static long expected(long opening,long sales,long refunds,long purchases,long expenses,long otherReceipts,long otherPayments) {
        return whole(BigDecimal.valueOf(opening).add(BigDecimal.valueOf(sales)).add(BigDecimal.valueOf(otherReceipts))
          .subtract(BigDecimal.valueOf(refunds)).subtract(BigDecimal.valueOf(purchases)).subtract(BigDecimal.valueOf(expenses)).subtract(BigDecimal.valueOf(otherPayments)));
    }
    private Long openingBalance(UUID restaurant,LocalDate date) {
        var initial=jdbc.query("SELECT amount FROM public.accounting_cash_openings WHERE restaurant_id=? AND opening_date=?",(rs,n)->rs.getLong(1),restaurant,date);
        if(!initial.isEmpty())return initial.getFirst();
        return jdbc.query("""
          SELECT c.actual_cash FROM public.accounting_cash_closings c WHERE c.restaurant_id=? AND c.closing_date=?
          AND NOT EXISTS(SELECT 1 FROM public.accounting_cash_closing_reversals r WHERE r.restaurant_id=c.restaurant_id AND r.closing_id=c.id)
          ORDER BY c.revision DESC LIMIT 1
          """,(rs,n)->rs.getLong(1),restaurant,date.minusDays(1)).stream().findFirst().orElse(null);
    }
    public Page<Transaction> transactions(UUID restaurant,LocalDate from,LocalDate to,int page,int size) {
        support.read(restaurant);page(page,size);var range=support.range(restaurant,from,to);
        String filter=" FROM ("+TRANSACTIONS+") t WHERE restaurant_id=? AND occurred_at>=? AND occurred_at<?";
        Long count=jdbc.queryForObject("SELECT COUNT(*)"+filter,Long.class,restaurant,range.start(),range.end());
        var items=jdbc.query("SELECT *"+filter+" ORDER BY occurred_at,id LIMIT ? OFFSET ?",(rs,n)->new Transaction(rs.getObject("id",UUID.class),rs.getString("source"),rs.getObject("source_id",UUID.class),rs.getObject("occurred_at",OffsetDateTime.class),rs.getLong("signed_amount"),rs.getObject("recorded_by",UUID.class),rs.getString("description")),restaurant,range.start(),range.end(),size,Math.multiplyExact(page,size));
        return new Page<>(items,count==null?0:count,page,size);
    }
    public Page<Closing> closings(UUID restaurant,LocalDate from,LocalDate to,int page,int size) {
        support.read(restaurant);page(page,size);var range=support.range(restaurant,from,to);
        Long count=jdbc.queryForObject("SELECT COUNT(*) FROM public.accounting_cash_closings WHERE restaurant_id=? AND closing_date BETWEEN ? AND ?",Long.class,restaurant,range.from(),range.to());
        var items=jdbc.query(CLOSINGS+" WHERE c.restaurant_id=? AND c.closing_date BETWEEN ? AND ? ORDER BY closing_date DESC,revision DESC LIMIT ? OFFSET ?",CLOSING_MAPPER,restaurant,range.from(),range.to(),size,Math.multiplyExact(page,size));
        return new Page<>(items,count==null?0:count,page,size);
    }
    @Transactional
    public UUID open(UUID restaurant,String key,Opening r) {
        UUID actor=support.write(restaurant);
        return support.once(restaurant,"cash.open",key,r,()->{
            if(r==null||r.amount()==null||r.amount()<0||r.date()==null||r.date().getYear()<1900)throw invalid("INVALID_CASH_OPENING");
            ExpenseService.reason(new ExpenseDtos.Reason(r.reason()));support.assertOpenDay(restaurant,r.date());
            if(Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM public.accounting_cash_openings WHERE restaurant_id=?)",Boolean.class,restaurant)))throw conflict("INITIAL_CASH_OPENING_ALREADY_EXISTS");
            UUID id=UUID.randomUUID();jdbc.update("INSERT INTO public.accounting_cash_openings(id,restaurant_id,opening_date,amount,reason,created_by) VALUES(?,?,?,?,?,?)",id,restaurant,r.date(),r.amount(),r.reason().trim(),actor);
            support.audit(restaurant,actor,"CASH_OPENING",id,"OPEN",r.reason(),r);return id;
        });
    }
    @Transactional
    public UUID movement(UUID restaurant,String key,Movement r) {
        UUID actor=support.write(restaurant);
        return support.once(restaurant,"cash.movement",key,r,()->{
            validateMovement(r);ExpenseService.reason(new ExpenseDtos.Reason(r.reason()));
            LocalDate date=r.occurredAt().atZoneSameInstant(support.zone(restaurant)).toLocalDate();
            if(date.getYear()<1900)throw invalid("INVALID_CASH_MOVEMENT_DATE");support.assertOpenDay(restaurant,date);
            UUID id=UUID.randomUUID();long amount=r.direction()==Direction.IN?r.amount():Math.negateExact(r.amount());
            jdbc.update("INSERT INTO public.accounting_cash_movements(id,restaurant_id,kind,signed_amount,occurred_at,reason,created_by) VALUES(?,?,?,?,?,?,?)",id,restaurant,r.kind().name(),amount,r.occurredAt(),r.reason().trim(),actor);
            support.audit(restaurant,actor,"CASH_MOVEMENT",id,"POST",r.reason(),r);return id;
        });
    }
    static void validateMovement(Movement r) {
        if(r==null||r.kind()==null||r.direction()==null||r.amount()==null||r.amount()<=0||r.occurredAt()==null||r.occurredAt().isAfter(OffsetDateTime.now()))throw invalid("INVALID_CASH_MOVEMENT");
        boolean inflow=Set.of(Kind.OTHER_RECEIPT,Kind.OWNER_DEPOSIT,Kind.BANK_WITHDRAWAL).contains(r.kind());
        if(r.kind()!=Kind.ADJUSTMENT&&inflow!=(r.direction()==Direction.IN))throw invalid("CASH_MOVEMENT_DIRECTION_MISMATCH");
    }
    @Transactional
    public UUID reverseMovement(UUID restaurant,UUID movement,String key,ExpenseDtos.Reason r) {
        UUID actor=support.write(restaurant);ExpenseService.reason(r);
        return support.once(restaurant,"cash.movement.reverse."+movement,key,r,()->{
            if(!Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM public.accounting_cash_movements WHERE restaurant_id=? AND id=?)",Boolean.class,restaurant,movement)))throw missing("CASH_MOVEMENT_NOT_FOUND");
            if(Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM public.accounting_cash_movement_reversals WHERE restaurant_id=? AND movement_id=?)",Boolean.class,restaurant,movement)))throw conflict("CASH_MOVEMENT_ALREADY_REVERSED");
            OffsetDateTime reversedAt=OffsetDateTime.now(ZoneOffset.UTC);
            support.assertOpenDay(restaurant,reversedAt.atZoneSameInstant(support.zone(restaurant)).toLocalDate());UUID id=UUID.randomUUID();
            jdbc.update("INSERT INTO public.accounting_cash_movement_reversals(id,restaurant_id,movement_id,reason,created_by,created_at) VALUES(?,?,?,?,?,?)",id,restaurant,movement,r.reason().trim(),actor,reversedAt);
            support.audit(restaurant,actor,"CASH_MOVEMENT",movement,"REVERSE",r.reason(),r);return id;
        });
    }
    @Transactional
    public Closing close(UUID restaurant,String key,Close r) {
        UUID actor=support.write(restaurant);
        UUID id=support.once(restaurant,"cash.close",key,r,()->{
            if(r==null||r.date()==null||r.actualCash()==null||r.actualCash()<0)throw invalid("INVALID_CASH_COUNT");
            support.assertOpenDay(restaurant,r.date());Day current=day(restaurant,r.date());
            if(current.openingBalance()==null)throw conflict("PREVIOUS_CASH_DAY_MUST_BE_CLOSED");
            if(!current.missingInputs().isEmpty()) {
                if(!Boolean.TRUE.equals(r.acknowledgeMissingInputs()))throw conflict("CASH_RECONCILIATION_INPUTS_REQUIRED");
                ExpenseService.reason(new ExpenseDtos.Reason(r.reconciliationReason()));
            }
            if(r.reconciliationReason()!=null&&r.reconciliationReason().length()>2000)throw invalid("INVALID_RECONCILIATION_NOTE");
            Integer revision=jdbc.queryForObject("SELECT COALESCE(MAX(revision),0)+1 FROM public.accounting_cash_closings WHERE restaurant_id=? AND closing_date=?",Integer.class,restaurant,r.date());
            long variance=whole(BigDecimal.valueOf(r.actualCash()).subtract(BigDecimal.valueOf(current.expectedClosingCash())));UUID created=UUID.randomUUID();
            String inputs=tools.jackson.databind.json.JsonMapper.builder().build().writeValueAsString(current.missingInputs());
            jdbc.update("INSERT INTO public.accounting_cash_closings(id,restaurant_id,closing_date,revision,opening_balance,expected_cash,actual_cash,variance,created_by,reconciliation_note,missing_inputs) VALUES(?,?,?,?,?,?,?,?,?,?,CAST(? AS jsonb))",created,restaurant,r.date(),revision,current.openingBalance(),current.expectedClosingCash(),r.actualCash(),variance,actor,r.reconciliationReason(),inputs);
            support.audit(restaurant,actor,"CASH_CLOSING",created,"FINALIZE",r.reconciliationReason(),Map.of("cashbook",current,"confirmation",r));return created;
        });
        return jdbc.query(CLOSINGS+" WHERE c.restaurant_id=? AND c.id=?",CLOSING_MAPPER,restaurant,id).stream().findFirst().orElseThrow(()->missing("CASH_CLOSING_NOT_FOUND"));
    }
    @Transactional
    public UUID reverseClosing(UUID restaurant,UUID closing,String key,ExpenseDtos.Reason r) {
        UUID actor=support.write(restaurant);ExpenseService.reason(r);
        return support.once(restaurant,"cash.close.reverse."+closing,key,r,()->{
            Closing current=jdbc.query(CLOSINGS+" WHERE c.restaurant_id=? AND c.id=?",CLOSING_MAPPER,restaurant,closing).stream().findFirst().orElseThrow(()->missing("CASH_CLOSING_NOT_FOUND"));
            if(current.reversedAt()!=null)throw conflict("CASH_CLOSING_ALREADY_REVERSED");
            if(Boolean.TRUE.equals(jdbc.queryForObject("""
              SELECT EXISTS(SELECT 1 FROM public.accounting_cash_closings c WHERE c.restaurant_id=? AND c.closing_date>?
                AND NOT EXISTS(SELECT 1 FROM public.accounting_cash_closing_reversals r WHERE r.restaurant_id=c.restaurant_id AND r.closing_id=c.id))
              """,Boolean.class,restaurant,current.date())))throw conflict("REVERSE_LATER_CASH_CLOSINGS_FIRST");
            UUID id=UUID.randomUUID();jdbc.update("INSERT INTO public.accounting_cash_closing_reversals(id,restaurant_id,closing_id,reason,created_by) VALUES(?,?,?,?,?)",id,restaurant,closing,r.reason().trim(),actor);
            support.audit(restaurant,actor,"CASH_CLOSING",closing,"REVERSE",r.reason(),r);return id;
        });
    }
}
