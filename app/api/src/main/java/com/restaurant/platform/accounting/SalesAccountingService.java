package com.restaurant.platform.accounting;

import static com.restaurant.platform.accounting.AccountingSupport.*;
import static com.restaurant.platform.accounting.SalesDtos.*;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
public class SalesAccountingService {
    private final NamedParameterJdbcTemplate jdbc;
    private final AccountingSupport support;
    private static final Set<String> PAYMENT_STATUSES = Set.of("UNPAID", "PARTIALLY_PAID", "PAID", "PARTIALLY_REFUNDED", "REFUNDED", "CANCELLED");
    private static final Set<String> CHANNELS = Set.of("TABLE_QR", "COMMON_QR", "STAFF", "CUSTOMER_APP");
    private static final String PAYMENT_CTE = """
        WITH ps AS (
          SELECT p.order_id, COALESCE(SUM(p.amount) FILTER (WHERE p.status IN ('PAID','REFUNDED')),0) AS paid,
            COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'REFUNDED'),0) AS legacy_refund
          FROM public.payments p JOIN public.orders po ON po.id=p.order_id
          WHERE po.restaurant_id=:restaurant GROUP BY p.order_id
        ), rf AS (SELECT f.order_id, SUM(f.amount) AS refunded FROM public.sales_refunds f WHERE f.restaurant_id=:restaurant
          AND NOT EXISTS(SELECT 1 FROM public.sales_refund_reversals v WHERE v.restaurant_id=f.restaurant_id AND v.refund_id=f.id) GROUP BY f.order_id),
        ledger AS (
          SELECT o.*, COALESCE(ps.paid,0) AS paid_amount,
            COALESCE(rf.refunded,0)+COALESCE(ps.legacy_refund,0) AS refund_amount,
            CASE WHEN COALESCE(rf.refunded,0)+COALESCE(ps.legacy_refund,0)>0 THEN
              CASE WHEN COALESCE(rf.refunded,0)+COALESCE(ps.legacy_refund,0)>=COALESCE(ps.paid,0) THEN 'REFUNDED' ELSE 'PARTIALLY_REFUNDED' END
              WHEN o.status='CANCELLED' AND COALESCE(ps.paid,0)=0 THEN 'CANCELLED'
              WHEN COALESCE(ps.paid,0)>=o.total_amount THEN 'PAID'
              WHEN COALESCE(ps.paid,0)>0 THEN 'PARTIALLY_PAID' ELSE 'UNPAID' END AS accounting_payment_status
          FROM public.orders o LEFT JOIN ps ON ps.order_id=o.id LEFT JOIN rf ON rf.order_id=o.id
          WHERE o.restaurant_id=:restaurant
        )
        """;
    public SalesAccountingService(NamedParameterJdbcTemplate jdbc, AccountingSupport support) {
        this.jdbc = jdbc; this.support = support;
    }

    public Dashboard dashboard(UUID restaurantId, LocalDate day, YearMonth month, Integer year) {
        support.read(restaurantId);
        LocalDate today = support.today(restaurantId);
        LocalDate selected = day == null ? today : day;
        YearMonth selectedMonth = month == null ? YearMonth.from(today) : month;
        int selectedYear = year == null ? today.getYear() : year;
        if (selectedYear < 1900 || selectedYear > 9998) throw invalid("INVALID_REPORT_YEAR");
        LocalDate yearStart = LocalDate.of(selectedYear,1,1);
        String currency=jdbc.queryForObject("SELECT currency FROM public.restaurant_settings WHERE restaurant_id=:restaurant",new MapSqlParameterSource("restaurant",restaurantId),String.class);
        return new Dashboard(support.zone(restaurantId).getId(),currency,
            summaryInternal(restaurantId,today,today), summaryInternal(restaurantId,selected,selected),
            summaryInternal(restaurantId,selectedMonth.atDay(1),selectedMonth.atEndOfMonth()),
            summaryInternal(restaurantId,yearStart,yearStart.plusYears(1).minusDays(1)),
            trends(restaurantId,selectedMonth.atDay(1),selectedMonth.atEndOfMonth(),false),
            trends(restaurantId,yearStart,yearStart.plusYears(1).minusDays(1),true),
            productsInternal(restaurantId, selectedMonth.atDay(1),selectedMonth.atEndOfMonth(),null,ProductSort.MOST_SOLD,0,10).content(),
            definitions(), List.of("No line discounts are stored: lineDiscount is zero; discounts remain at order level.",
            "Legacy REFUNDED payments have no refund event timestamp; legacyRefundsWithoutEventTime is cohort-only and is excluded from dated refund totals.",
            "Legacy cashier identities remain null when never recorded. Sales cohorts are restated for current cancellations; status history retains original cancellation timestamps."));
    }

    public Summary summary(UUID restaurantId, LocalDate from, LocalDate to) {
        support.read(restaurantId); return summaryInternal(restaurantId,from,to);
    }
    private Summary summaryInternal(UUID restaurantId, LocalDate from, LocalDate to) {
        var range = support.range(restaurantId,from,to);
        var p = parameters(restaurantId,range.start(),range.end());
        long[] cohort = jdbc.queryForObject("""
            SELECT COALESCE(SUM(subtotal::numeric+delivery_fee) FILTER (WHERE status<>'CANCELLED'),0) gross,
              COALESCE(SUM(discount_amount) FILTER (WHERE status<>'CANCELLED'),0) discounts,
              COALESCE(SUM(total_amount) FILTER (WHERE status<>'CANCELLED'),0) net,
              COUNT(*) FILTER (WHERE status<>'CANCELLED') orders, COUNT(*) FILTER (WHERE status='CANCELLED') cancelled
            FROM public.orders WHERE restaurant_id=:restaurant AND created_at>=:start AND created_at<:end
            """,p,(rs,n)->new long[]{money(rs,"gross"),money(rs,"discounts"),money(rs,"net"),rs.getLong("orders"),rs.getLong("cancelled")});
        long collected = scalar("""
            SELECT COALESCE(SUM(p.amount),0) FROM public.payments p JOIN public.orders o ON o.id=p.order_id
            WHERE o.restaurant_id=:restaurant AND p.status IN ('PAID','REFUNDED') AND p.paid_at>=:start AND p.paid_at<:end
            """,p);
        long outstanding = scalar(PAYMENT_CTE+"""
            SELECT COALESCE(SUM(GREATEST(total_amount-paid_amount,0)),0) FROM ledger
            WHERE status<>'CANCELLED' AND created_at>=:start AND created_at<:end
            """,p);
        long refunded = scalar("""
            SELECT COALESCE(SUM(amount),0) FROM (
              SELECT amount FROM public.sales_refunds WHERE restaurant_id=:restaurant AND refunded_at>=:start AND refunded_at<:end
              UNION ALL SELECT -f.amount FROM public.sales_refund_reversals v JOIN public.sales_refunds f ON f.id=v.refund_id AND f.restaurant_id=v.restaurant_id
                WHERE v.restaurant_id=:restaurant AND v.created_at>=:start AND v.created_at<:end
            ) adjustments
            """,p);
        long legacyRefund = scalar("""
            SELECT COALESCE(SUM(p.amount),0) FROM public.payments p JOIN public.orders o ON o.id=p.order_id
            WHERE o.restaurant_id=:restaurant AND p.status='REFUNDED' AND o.created_at>=:start AND o.created_at<:end
            """,p);
        long quantity = scalar("""
            SELECT COALESCE(SUM(i.quantity),0) FROM public.order_items i JOIN public.orders o ON o.id=i.order_id AND o.restaurant_id=i.restaurant_id
            WHERE o.restaurant_id=:restaurant AND o.status<>'CANCELLED' AND o.created_at>=:start AND o.created_at<:end
            """,p);
        return new Summary(range.from(),range.to(),cohort[0],cohort[1],cohort[2],collected,outstanding,refunded,cohort[3],cohort[4],quantity,legacyRefund);
    }

    private List<Trend> trends(UUID restaurantId, LocalDate from, LocalDate to, boolean monthly) {
        var range=support.range(restaurantId,from,to);
        var p=parameters(restaurantId,range.start(),range.end()).addValue("zone",support.zone(restaurantId).getId());
        String unit=monthly?"month":"day";
        List<Trend> existing=jdbc.query("""
            WITH quantities AS (SELECT order_id, SUM(quantity) qty FROM public.order_items WHERE restaurant_id=:restaurant GROUP BY order_id)
            SELECT to_char(date_trunc('%s',o.created_at AT TIME ZONE :zone),'%s') period,
              COALESCE(SUM(o.subtotal::numeric+o.delivery_fee),0) gross, COALESCE(SUM(o.discount_amount),0) discounts,
              COALESCE(SUM(o.total_amount),0) net,COUNT(*) orders,COALESCE(SUM(q.qty),0) qty
            FROM public.orders o LEFT JOIN quantities q ON q.order_id=o.id
            WHERE o.restaurant_id=:restaurant AND o.status<>'CANCELLED' AND o.created_at>=:start AND o.created_at<:end
            GROUP BY period ORDER BY period
            """.formatted(unit,monthly?"YYYY-MM":"YYYY-MM-DD"),p,
            (rs,n)->new Trend(rs.getString("period"),money(rs,"gross"),money(rs,"discounts"),money(rs,"net"),rs.getLong("orders"),money(rs,"qty")));
        Map<String,Trend> byPeriod=new HashMap<>(); existing.forEach(t->byPeriod.put(t.period(),t));
        List<Trend> result=new ArrayList<>();
        for(LocalDate date=from; !date.isAfter(to); date=monthly?date.plusMonths(1):date.plusDays(1)) {
            String key=monthly?YearMonth.from(date).toString():date.toString();
            result.add(byPeriod.getOrDefault(key,new Trend(key,0,0,0,0,0)));
        }
        return result;
    }

    public LedgerPage<Product> products(UUID restaurantId,LocalDate from,LocalDate to,String search,ProductSort sort,int page,int size) {
        support.read(restaurantId); return productsInternal(restaurantId,from,to,search,sort,page,size);
    }
    private LedgerPage<Product> productsInternal(UUID restaurantId,LocalDate from,LocalDate to,String search,ProductSort sort,int page,int size) {
        page(page,size); var range=support.range(restaurantId,from,to);
        var p=parameters(restaurantId,range.start(),range.end()).addValue("search",like(search)).addValue("limit",size).addValue("offset",(long)page*size);
        String base="""
            FROM public.order_items i JOIN public.orders o ON o.id=i.order_id AND o.restaurant_id=i.restaurant_id
            WHERE o.restaurant_id=:restaurant AND o.status<>'CANCELLED' AND o.created_at>=:start AND o.created_at<:end
              AND (:search='' OR i.product_name ILIKE :search OR CAST(i.product_id AS text) ILIKE :search)
            """;
        long count=scalar("SELECT COUNT(*) FROM (SELECT i.product_id,i.product_name "+base+" GROUP BY i.product_id,i.product_name) grouped",p);
        String ordering = switch (sort) {
            case MOST_SOLD -> "quantity DESC,i.product_id,i.product_name";
            case HIGHEST_SALES -> "amount DESC,i.product_id,i.product_name";
            case NAME -> "lower(i.product_name),i.product_name,i.product_id";
        };
        var rows=jdbc.query("SELECT i.product_id,i.product_name, SUM(i.quantity) quantity, SUM(i.subtotal) amount "+base+
            " GROUP BY i.product_id,i.product_name ORDER BY "+ordering+" LIMIT :limit OFFSET :offset",p,
            (rs,n)->new Product(uuid(rs,"product_id"),rs.getString("product_name"),money(rs,"quantity"),money(rs,"amount")));
        return new LedgerPage<>(rows,page,size,count);
    }

    public LedgerPage<LedgerOrder> ledger(UUID restaurantId,LocalDate from,LocalDate to,String product,String order,String paymentStatus,String channel,LedgerSort sort,int page,int size) {
        support.read(restaurantId); page(page,size);
        var range=support.range(restaurantId,from,to);
        var p=filter(restaurantId,range.start(),range.end(),product,order,paymentStatus,channel).addValue("limit",size).addValue("offset",(long)page*size);
        long total=scalar(PAYMENT_CTE+"SELECT COUNT(*) FROM ledger o "+where(),p);
        var rows=jdbc.query(PAYMENT_CTE+"SELECT o.* FROM ledger o "+where()+ledgerOrder(sort)+" LIMIT :limit OFFSET :offset",p,
            (rs,n)->order(rs,restaurantId));
        return new LedgerPage<>(rows,page,size,total);
    }

    public LedgerOrder detail(UUID restaurantId,UUID orderId) {
        support.read(restaurantId); return detailInternal(restaurantId,orderId);
    }
    private LedgerOrder detailInternal(UUID restaurantId,UUID orderId) {
        var p=new MapSqlParameterSource("restaurant",restaurantId).addValue("order",orderId);
        var orders=jdbc.query(PAYMENT_CTE+"SELECT * FROM ledger WHERE id=:order",p,(rs,n)->order(rs,restaurantId));
        if(orders.isEmpty()) throw missing("SALES_ORDER_NOT_FOUND");
        return orders.getFirst();
    }

    private LedgerOrder order(ResultSet rs,UUID restaurantId) throws SQLException {
        UUID orderId=uuid(rs,"id"); var p=new MapSqlParameterSource("restaurant",restaurantId).addValue("order",orderId);
        var lines=jdbc.query("SELECT * FROM public.order_items WHERE restaurant_id=:restaurant AND order_id=:order ORDER BY created_at,id",p,
            (line,n)->new Line(uuid(line,"id"),uuid(line,"product_id"),line.getString("product_name"),uuid(line,"variant_id"),line.getString("variant_name"),
                line.getInt("quantity"),line.getLong("unit_price"),0,line.getLong("subtotal"),modifiers(restaurantId,uuid(line,"id"))));
        var payments=jdbc.query("SELECT p.* FROM public.payments p JOIN public.orders o ON o.id=p.order_id WHERE o.restaurant_id=:restaurant AND p.order_id=:order ORDER BY p.created_at,p.id",p,
            (pay,n)->new PaymentRow(uuid(pay,"id"),pay.getString("method"),pay.getString("status"),pay.getLong("amount"),time(pay,"paid_at"),uuid(pay,"collected_by_user_id"),time(pay,"created_at")));
        var refunds=jdbc.query("SELECT * FROM public.sales_refunds WHERE restaurant_id=:restaurant AND order_id=:order ORDER BY refunded_at,id",p,this::refund);
        var reversals=jdbc.query("SELECT v.*,f.amount,f.method FROM public.sales_refund_reversals v JOIN public.sales_refunds f ON f.id=v.refund_id AND f.restaurant_id=v.restaurant_id WHERE v.restaurant_id=:restaurant AND v.order_id=:order ORDER BY v.created_at,v.id",p,this::refundReversal);
        List<Event> events=new ArrayList<>();
        events.add(new Event("ORDER_CREATED",time(rs,"created_at"),uuid(rs,"created_by_user_id"),rs.getLong("total_amount"),rs.getString("order_number")));
        payments.stream().filter(pay->pay.paidAt()!=null && ("PAID".equals(pay.status())||"REFUNDED".equals(pay.status()))).forEach(pay->events.add(new Event("PAYMENT_COLLECTED",pay.paidAt(),pay.collectedByUserId(),pay.amount(),pay.method()+" / "+pay.id())));
        refunds.forEach(ref->events.add(new Event("REFUND",ref.refundedAt(),ref.createdBy(),-ref.amount(),ref.reason())));
        reversals.forEach(reversal->events.add(new Event("REFUND_REVERSAL",reversal.createdAt(),reversal.createdBy(),reversal.amount(),reversal.reason())));
        events.addAll(jdbc.query("SELECT h.* FROM public.order_status_history h JOIN public.orders o ON o.id=h.order_id WHERE o.restaurant_id=:restaurant AND h.order_id=:order",p,
            (h,n)->new Event("ORDER_"+h.getString("status"),time(h,"created_at"),uuid(h,"changed_by_user_id"),null,h.getString("note"))));
        events.sort(Comparator.comparing(Event::timestamp).thenComparing(Event::type));
        return new LedgerOrder(orderId,rs.getString("order_number"),time(rs,"created_at"),uuid(rs,"created_by_user_id"),
            rs.getString("order_channel"),rs.getString("order_type"),rs.getString("status"),uuid(rs,"table_id"),rs.getString("table_number_snapshot"),
            uuid(rs,"queue_ticket_id"),rs.getString("queue_code_snapshot"),rs.getLong("subtotal"),rs.getLong("delivery_fee"),rs.getLong("discount_amount"),
            rs.getLong("total_amount"),rs.getString("accounting_payment_status"),lines,payments,refunds,reversals,events);
    }
    private List<Modifier> modifiers(UUID restaurantId,UUID lineId) {
        return jdbc.query("SELECT * FROM public.order_item_modifiers WHERE restaurant_id=:restaurant AND order_item_id=:line ORDER BY id",
            new MapSqlParameterSource("restaurant",restaurantId).addValue("line",lineId),
            (rs,n)->new Modifier(uuid(rs,"modifier_option_id"),rs.getString("name"),rs.getLong("additional_price"),rs.getInt("quantity")));
    }

    @Transactional(isolation=Isolation.READ_COMMITTED)
    public Refund refund(UUID restaurantId,UUID orderId,String key,RefundRequest request) {
        UUID actor=support.write(restaurantId); support.lock(restaurantId);
        if(request==null || request.paymentId()==null || request.amount()<=0 || request.refundedAt()==null || request.reason()==null || request.reason().isBlank() || request.reason().length()>1000)
            throw invalid("INVALID_REFUND");
        UUID id=support.once(restaurantId,"SALES_REFUND",key,List.of(orderId,request),()-> {
            var p=new MapSqlParameterSource("restaurant",restaurantId).addValue("order",orderId).addValue("payment",request.paymentId());
            var paid=jdbc.query("""
                SELECT p.* FROM public.payments p JOIN public.orders o ON o.id=p.order_id
                WHERE o.restaurant_id=:restaurant AND p.order_id=:order AND p.id=:payment FOR UPDATE OF p
                """,p,(rs,n)->new PaymentRow(uuid(rs,"id"),rs.getString("method"),rs.getString("status"),rs.getLong("amount"),time(rs,"paid_at"),uuid(rs,"collected_by_user_id"),time(rs,"created_at")));
            if(paid.isEmpty()) throw missing("SALES_PAYMENT_NOT_FOUND");
            PaymentRow payment=paid.getFirst();
            if(!"PAID".equals(payment.status()) || payment.paidAt()==null) throw conflict("REFUND_REQUIRES_COLLECTED_PAYMENT");
            if(request.refundedAt().isBefore(payment.paidAt()) || request.refundedAt().isAfter(OffsetDateTime.now(ZoneOffset.UTC))) throw invalid("INVALID_REFUND_DATE");
            long refunded=scalar("SELECT COALESCE(SUM(f.amount),0) FROM public.sales_refunds f WHERE f.restaurant_id=:restaurant AND f.payment_id=:payment AND NOT EXISTS(SELECT 1 FROM public.sales_refund_reversals v WHERE v.restaurant_id=f.restaurant_id AND v.refund_id=f.id)",p);
            if(request.amount()>payment.amount()-refunded) throw conflict("REFUND_EXCEEDS_COLLECTED_PAYMENT");
            if(!"ONLINE".equals(payment.method())) support.assertOpenDay(restaurantId,request.refundedAt().atZoneSameInstant(support.zone(restaurantId)).toLocalDate());
            UUID refundId=UUID.randomUUID();
            p.addValue("id",refundId).addValue("amount",request.amount()).addValue("method",payment.method()).addValue("at",request.refundedAt()).addValue("actor",actor).addValue("reason",request.reason().trim());
            jdbc.update("""
                INSERT INTO public.sales_refunds(id,restaurant_id,order_id,payment_id,amount,method,refunded_at,created_by,reason)
                VALUES(:id,:restaurant,:order,:payment,:amount,:method,:at,:actor,:reason)
                """,p);
            support.audit(restaurantId,actor,"SALES_REFUND",refundId,"POST",request.reason().trim(),request);
            return refundId;
        });
        return jdbc.queryForObject("SELECT * FROM public.sales_refunds WHERE restaurant_id=:restaurant AND id=:id",new MapSqlParameterSource("restaurant",restaurantId).addValue("id",id),this::refund);
    }
    private Refund refund(ResultSet rs,int n) throws SQLException {
        return new Refund(uuid(rs,"id"),uuid(rs,"order_id"),uuid(rs,"payment_id"),rs.getLong("amount"),rs.getString("method"),time(rs,"refunded_at"),uuid(rs,"created_by"),time(rs,"created_at"),rs.getString("reason"));
    }

    @Transactional(isolation=Isolation.READ_COMMITTED)
    public RefundReversal reverseRefund(UUID restaurantId,UUID orderId,UUID refundId,String key,ReversalRequest request) {
        UUID actor=support.write(restaurantId); support.lock(restaurantId);
        if(request==null||request.reason()==null||request.reason().isBlank()||request.reason().length()>1000) throw invalid("INVALID_REFUND_REVERSAL_REASON");
        UUID reversalId=support.once(restaurantId,"SALES_REFUND_REVERSAL",key,List.of(orderId,refundId,request),()->{
            var p=new MapSqlParameterSource("restaurant",restaurantId).addValue("order",orderId).addValue("refund",refundId);
            var originals=jdbc.query("SELECT * FROM public.sales_refunds WHERE restaurant_id=:restaurant AND order_id=:order AND id=:refund",p,this::refund);
            if(originals.isEmpty()) throw missing("SALES_REFUND_NOT_FOUND");
            if(scalar("SELECT COUNT(*) FROM public.sales_refund_reversals WHERE restaurant_id=:restaurant AND refund_id=:refund",p)>0) throw conflict("SALES_REFUND_ALREADY_REVERSED");
            if(!"ONLINE".equals(originals.getFirst().method())) support.assertOpenDay(restaurantId,support.today(restaurantId));
            UUID id=UUID.randomUUID(); p.addValue("id",id).addValue("actor",actor).addValue("reason",request.reason().trim());
            jdbc.update("INSERT INTO public.sales_refund_reversals(id,restaurant_id,order_id,refund_id,created_by,reason) VALUES(:id,:restaurant,:order,:refund,:actor,:reason)",p);
            support.audit(restaurantId,actor,"SALES_REFUND_REVERSAL",id,"REVERSE",request.reason().trim(),Map.of("refundId",refundId,"orderId",orderId));
            return id;
        });
        return jdbc.queryForObject("SELECT v.*,f.amount,f.method FROM public.sales_refund_reversals v JOIN public.sales_refunds f ON f.id=v.refund_id AND f.restaurant_id=v.restaurant_id WHERE v.restaurant_id=:restaurant AND v.id=:id",
            new MapSqlParameterSource("restaurant",restaurantId).addValue("id",reversalId),this::refundReversal);
    }
    private RefundReversal refundReversal(ResultSet rs,int n) throws SQLException {
        return new RefundReversal(uuid(rs,"id"),uuid(rs,"order_id"),uuid(rs,"refund_id"),rs.getLong("amount"),rs.getString("method"),uuid(rs,"created_by"),time(rs,"created_at"),rs.getString("reason"));
    }

    public String csvExport(UUID restaurantId,LocalDate from,LocalDate to,String product,String order,String paymentStatus,String channel,LedgerSort sort) {
        support.read(restaurantId); var range=support.range(restaurantId,from,to);
        var p=filter(restaurantId,range.start(),range.end(),product,order,paymentStatus,channel);
        long rows=scalar(PAYMENT_CTE+"SELECT COUNT(*) FROM ledger o "+where(),p);
        if(rows>5000) throw invalid("SALES_EXPORT_TOO_LARGE");
        var orders=jdbc.query(PAYMENT_CTE+"SELECT o.* FROM ledger o "+where()+ledgerOrder(sort),p,(rs,n)->order(rs,restaurantId));
        StringBuilder out=new StringBuilder("order_id,order_number,created_at,creator,channel,type,status,table_id,table_number,queue,product_id,historical_product_name,variant_id,variant,modifiers,quantity,historical_unit_price,line_discount,line_total,order_discount_once,order_total_once,payment_status,payments,refunds,refund_reversals,timeline\r\n");
        int lineCount=0;
        for(var sale:orders) {
            boolean first=true;
            List<Line> lines=sale.lines().isEmpty()?Collections.singletonList(null):sale.lines();
            for(var line:lines) {
                if(++lineCount>20000) throw invalid("SALES_EXPORT_TOO_LARGE");
                List<Object> cells=Arrays.asList(sale.id(),sale.orderNumber(),sale.createdAt(),sale.createdByUserId(),sale.orderChannel(),sale.orderType(),sale.status(),sale.tableId(),sale.tableNumber(),sale.queueDisplayCode(),
                    line==null?null:line.productId(),line==null?null:line.productName(),line==null?null:line.variantId(),line==null?null:line.variantName(),line==null?null:line.modifiers(),line==null?null:line.quantity(),line==null?null:line.unitPrice(),line==null?null:line.lineDiscount(),line==null?null:line.lineTotal(),
                    first?sale.discountAmount():null,first?sale.totalAmount():null,sale.paymentStatus(),first?sale.payments():null,first?sale.refunds():null,first?sale.refundReversals():null,first?sale.timeline():null);
                out.append(cells.stream().map(AccountingSupport::csv).collect(java.util.stream.Collectors.joining(","))).append("\r\n"); first=false;
            }
        }
        return out.toString();
    }

    private static String ledgerOrder(LedgerSort sort) {
        return switch (sort) {
            case NEWEST -> " ORDER BY o.created_at DESC,o.id DESC";
            case OLDEST -> " ORDER BY o.created_at,o.id";
            case HIGHEST_TOTAL -> " ORDER BY o.total_amount DESC,o.created_at DESC,o.id DESC";
        };
    }

    private MapSqlParameterSource filter(UUID restaurantId,OffsetDateTime start,OffsetDateTime end,String product,String order,String paymentStatus,String channel) {
        if(paymentStatus!=null&&!PAYMENT_STATUSES.contains(paymentStatus)) throw invalid("INVALID_PAYMENT_STATUS_FILTER");
        if(channel!=null&&!CHANNELS.contains(channel)) throw invalid("INVALID_ORDER_CHANNEL_FILTER");
        return parameters(restaurantId,start,end).addValue("product",like(product)).addValue("orderSearch",like(order))
            .addValue("paymentStatus",paymentStatus==null?"":paymentStatus).addValue("channel",channel==null?"":channel);
    }
    private String where() { return """
        WHERE o.created_at>=:start AND o.created_at<:end
          AND (:channel='' OR o.order_channel=:channel)
          AND (:paymentStatus='' OR o.accounting_payment_status=:paymentStatus)
          AND (:orderSearch='' OR o.order_number ILIKE :orderSearch OR CAST(o.id AS text) ILIKE :orderSearch)
          AND (:product='' OR EXISTS(SELECT 1 FROM public.order_items i WHERE i.restaurant_id=o.restaurant_id AND i.order_id=o.id
               AND (i.product_name ILIKE :product OR CAST(i.product_id AS text) ILIKE :product)))
        """; }
    private String like(String search) {
        if(search==null||search.isBlank()) return "";
        if(search.length()>150) throw invalid("INVALID_SALES_SEARCH");
        return "%"+search.trim().replace("\\","\\\\").replace("%","\\%").replace("_","\\_")+"%";
    }
    private MapSqlParameterSource parameters(UUID restaurantId,OffsetDateTime start,OffsetDateTime end) {
        return new MapSqlParameterSource("restaurant",restaurantId).addValue("start",start).addValue("end",end);
    }
    private long scalar(String sql,MapSqlParameterSource parameters) {
        return jdbc.queryForObject(sql,parameters,(rs,n)->whole(rs.getBigDecimal(1)));
    }
    private static long money(ResultSet rs,String name) throws SQLException { return whole(rs.getBigDecimal(name)); }
    private static UUID uuid(ResultSet rs,String name) throws SQLException { return rs.getObject(name,UUID.class); }
    private static OffsetDateTime time(ResultSet rs,String name) throws SQLException { return rs.getObject(name,OffsetDateTime.class); }
    private Map<String,String> definitions() {
        return Map.ofEntries(
            Map.entry("grossSales","Sum of immutable order subtotal plus delivery fee for non-cancelled orders created in the local period; before order discounts."),
            Map.entry("discounts","Stored order-level discounts on that same non-cancelled order cohort; never allocated or repeated per line."),
            Map.entry("netSales","Gross sales minus discounts, before refunds; based on order creation time, including unpaid orders."),
            Map.entry("collectedPayments","Original collected payment amounts whose actual paid_at is in the period, including legacy REFUNDED originals. Not order revenue and not reduced by refunds."),
            Map.entry("outstandingPayments","Per-order max(total minus all confirmed collections, zero) for the created-period non-cancelled cohort. Refunds do not reopen receivables."),
            Map.entry("refundedAmounts","Recorded refund outflows by refunded_at minus controlled reversal inflows by their actual posting created_at in the period. Can be negative when correcting an earlier period; original history is retained."),
            Map.entry("orders","Non-cancelled orders created in the period. Cancelled orders have a separate count and retain their ledger rows."),
            Map.entry("productsSold","Sum of order-item quantities for the same non-cancelled created-period cohort. No deduction guessed for amount-only refunds."),
            Map.entry("productSales","Historical item subtotals including modifier charges, before order-level discounts and delivery fees; historical product names kept separately."));
    }
}
