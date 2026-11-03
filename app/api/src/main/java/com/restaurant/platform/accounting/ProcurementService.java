package com.restaurant.platform.accounting;

import static com.restaurant.platform.accounting.AccountingSupport.*;
import static com.restaurant.platform.accounting.ProcurementDtos.*;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Isolation;

@Service
@Transactional(readOnly = true,isolation = Isolation.REPEATABLE_READ)
public class ProcurementService {
    private final JdbcTemplate jdbc;
    private final NamedParameterJdbcTemplate named;
    private final AccountingSupport support;

    public ProcurementService(JdbcTemplate jdbc, AccountingSupport support) {
        this.jdbc = jdbc;
        this.named = new NamedParameterJdbcTemplate(jdbc);
        this.support = support;
    }

    public Page<Supplier> suppliers(UUID restaurant, String search, int page, int size) {
        return suppliers(restaurant, search, SupplierSort.NAME_ASC, page, size);
    }

    public Page<Supplier> suppliers(UUID restaurant, String search, SupplierSort sort, int page, int size) {
        support.read(restaurant); page(page, size);
        String pattern = searchPattern(search);
        long count = jdbc.queryForObject("SELECT count(*) FROM public.accounting_suppliers WHERE restaurant_id=? AND name ILIKE ?", Long.class, restaurant, pattern);
        String order = sort == SupplierSort.NAME_DESC ? "name DESC,id" : "name,id";
        return new Page<>(jdbc.query("SELECT * FROM public.accounting_suppliers WHERE restaurant_id=? AND name ILIKE ? ORDER BY "+order+" LIMIT ? OFFSET ?",
                this::supplier, restaurant, pattern, size, (long)page*size), count, page, size);
    }

    @Transactional
    public Supplier saveSupplier(UUID restaurant, UUID id, String key, SupplierInput input) {
        UUID actor=support.write(restaurant); support.lock(restaurant);
        String name=text(input.name(),150), contact=optional(input.contact(),500);
        UUID result=support.once(restaurant,"supplier:"+id,key,input,()->{
            UUID target=id == null ? UUID.randomUUID():id;
            if (id==null) jdbc.update("INSERT INTO public.accounting_suppliers(id,restaurant_id,name,contact,active,created_by,updated_by) VALUES (?,?,?,?,?,?,?)",
                    target,restaurant,name,contact,input.active(),actor,actor);
            else {
                String reason=text(input.reason(),1000);
                if(jdbc.update("UPDATE public.accounting_suppliers SET name=?,contact=?,active=?,updated_by=?,updated_at=now() WHERE restaurant_id=? AND id=?",
                        name,contact,input.active(),actor,restaurant,id)!=1) throw missing("SUPPLIER_NOT_FOUND");
                support.audit(restaurant,actor,"SUPPLIER",target,"CORRECT",reason,input);
            }
            if(id==null) support.audit(restaurant,actor,"SUPPLIER",target,"CREATE",null,input);
            return target;
        });
        return findSupplier(restaurant,result);
    }

    public Page<Item> items(UUID restaurant, String search, boolean suggestionsOnly, int page, int size) {
        return items(restaurant, search, suggestionsOnly, ShoppingItemSort.NAME_ASC, page, size);
    }

    public Page<Item> items(UUID restaurant, String search, boolean suggestionsOnly, ShoppingItemSort sort, int page, int size) {
        support.read(restaurant); page(page,size);
        LocalDate today=support.today(restaurant);
        Map<String,Object> args=new HashMap<>(); args.put("r",restaurant); args.put("search",searchPattern(search)); args.put("today",today);
        args.put("oldest",today.minusDays(6)); args.put("size",size); args.put("offset",(long)page*size);
        String filter=" WHERE i.restaurant_id=:r AND i.name ILIKE :search"+(suggestionsOnly ? " AND i.suggestion_enabled AND last_purchase.purchase_date BETWEEN :oldest AND :today":"");
        String base=ITEM_BASE;
        long count=named.queryForObject("SELECT count(*)"+base+filter,args,Long.class);
        String order = switch (sort) {
            case NAME_ASC -> "i.name,i.id";
            case NAME_DESC -> "i.name DESC,i.id";
            case LAST_PURCHASE_DESC -> "last_purchase.purchase_date DESC NULLS LAST,i.name,i.id";
        };
        List<Item> content=named.query("SELECT i.*,last_purchase.purchase_date,last_purchase.unit_cost,last_purchase.unit AS latest_cost_unit"+base+filter+" ORDER BY "+order+" LIMIT :size OFFSET :offset",args,
                (rs,n)->mapItem(rs,today));
        return new Page<>(content,count,page,size);
    }

    private static final String ITEM_BASE=" " + """
             FROM public.accounting_shopping_items i
             LEFT JOIN LATERAL (
               SELECT p.purchase_date,l.unit_cost,l.unit FROM public.accounting_purchase_lines l
               JOIN public.accounting_purchases p ON p.restaurant_id=l.restaurant_id AND p.id=l.purchase_id
               WHERE l.restaurant_id=i.restaurant_id AND l.item_id=i.id AND p.purchase_date<=:today
                 AND NOT EXISTS(SELECT 1 FROM public.accounting_purchase_cancellations c WHERE c.restaurant_id=p.restaurant_id AND c.purchase_id=p.id)
               ORDER BY p.purchase_date DESC,p.purchased_at DESC,p.created_at DESC,l.id DESC LIMIT 1
             ) last_purchase ON true
             """;
    private Item mapItem(ResultSet rs,LocalDate today)throws SQLException {
        return new Item(uuid(rs,"id"),rs.getString("name"),rs.getString("default_unit"),rs.getBigDecimal("default_quantity"),uuid(rs,"supplier_id"),
                rs.getBoolean("suggestion_enabled"),(Long)rs.getObject("unit_cost"),rs.getString("latest_cost_unit"),rs.getObject("purchase_date",LocalDate.class),
                eligible(today,rs.getObject("purchase_date",LocalDate.class),rs.getBoolean("suggestion_enabled")),uuid(rs,"created_by"),time(rs,"created_at"),uuid(rs,"updated_by"),time(rs,"updated_at"));
    }

    @Transactional
    public Item saveItem(UUID restaurant, UUID id, String key, ItemInput input) {
        UUID actor=support.write(restaurant); support.lock(restaurant);
        String name=text(input.name(),150), unit=text(input.defaultUnit(),30);
        if(input.defaultQuantity()!=null) quantity(input.defaultQuantity());
        supplierName(restaurant,input.supplierId());
        UUID result=support.once(restaurant,"shopping-item:"+id,key,input,()->{
            UUID target=id==null?UUID.randomUUID():id;
            if(id==null) jdbc.update("INSERT INTO public.accounting_shopping_items(id,restaurant_id,name,default_unit,default_quantity,supplier_id,suggestion_enabled,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?)",
                    target,restaurant,name,unit,input.defaultQuantity(),input.supplierId(),input.suggestionEnabled(),actor,actor);
            else {
                String reason=text(input.reason(),1000);
                if(jdbc.update("UPDATE public.accounting_shopping_items SET name=?,default_unit=?,default_quantity=?,supplier_id=?,suggestion_enabled=?,updated_by=?,updated_at=now() WHERE restaurant_id=? AND id=?",
                        name,unit,input.defaultQuantity(),input.supplierId(),input.suggestionEnabled(),actor,restaurant,id)!=1) throw missing("SHOPPING_ITEM_NOT_FOUND");
                support.audit(restaurant,actor,"SHOPPING_ITEM",target,"CORRECT",reason,input);
            }
            if(id==null) support.audit(restaurant,actor,"SHOPPING_ITEM",target,"CREATE",null,input);
            return target;
        });
        // Lookup by immutable identity: an idempotent retry still works after the item's name changed.
        LocalDate today=support.today(restaurant);
        return named.query("SELECT i.*,last_purchase.purchase_date,last_purchase.unit_cost,last_purchase.unit AS latest_cost_unit"+ITEM_BASE+" WHERE i.restaurant_id=:r AND i.id=:id",
                Map.of("r",restaurant,"id",result,"today",today),(rs,n)->mapItem(rs,today)).stream().findFirst().orElseThrow(()->missing("SHOPPING_ITEM_NOT_FOUND"));
    }

    private Item itemById(UUID restaurant,UUID id) {
        return jdbc.query("SELECT * FROM public.accounting_shopping_items WHERE restaurant_id=? AND id=?",(rs,n)->new Item(uuid(rs,"id"),rs.getString("name"),rs.getString("default_unit"),rs.getBigDecimal("default_quantity"),uuid(rs,"supplier_id"),rs.getBoolean("suggestion_enabled"),null,null,null,false,uuid(rs,"created_by"),time(rs,"created_at"),uuid(rs,"updated_by"),time(rs,"updated_at")),restaurant,id).stream().findFirst().orElseThrow(()->missing("SHOPPING_ITEM_NOT_FOUND"));
    }

    public Page<Sheet> sheets(UUID restaurant, LocalDate from, LocalDate to, int page, int size) {
        support.read(restaurant); page(page,size); var range=support.range(restaurant,from,to);
        long count=jdbc.queryForObject("SELECT count(*) FROM public.accounting_shopping_sheets WHERE restaurant_id=? AND shopping_date BETWEEN ? AND ?",Long.class,restaurant,range.from(),range.to());
        List<UUID> ids=jdbc.query("SELECT id FROM public.accounting_shopping_sheets WHERE restaurant_id=? AND shopping_date BETWEEN ? AND ? ORDER BY shopping_date DESC,created_at DESC,id LIMIT ? OFFSET ?",(rs,n)->uuid(rs,"id"),restaurant,range.from(),range.to(),size,(long)page*size);
        return new Page<>(ids.stream().map(id->sheet(restaurant,id)).toList(),count,page,size);
    }

    public Sheet sheet(UUID restaurant,UUID id) {
        support.read(restaurant);
        return jdbc.query("""
                SELECT s.*,p.id AS purchase_id,
                  CASE WHEN p.id IS NULL THEN 'PLANNED' WHEN c.id IS NULL THEN 'PURCHASED' ELSE 'CANCELLED' END AS state
                FROM public.accounting_shopping_sheets s
                LEFT JOIN public.accounting_purchases p ON p.restaurant_id=s.restaurant_id AND p.sheet_id=s.id
                LEFT JOIN public.accounting_purchase_cancellations c ON c.restaurant_id=p.restaurant_id AND c.purchase_id=p.id
                WHERE s.restaurant_id=? AND s.id=?
                """,(rs,n)->{
                    UUID purchase=uuid(rs,"purchase_id");
                    return new Sheet(id,rs.getObject("shopping_date",LocalDate.class),rs.getString("state"),purchase==null?"UNPURCHASED":purchaseSummary(restaurant,purchase).paymentStatus(),purchase,
                        jdbc.query("SELECT * FROM public.accounting_shopping_lines WHERE restaurant_id=? AND sheet_id=? ORDER BY id",this::planLine,restaurant,id),
                        uuid(rs,"created_by"),time(rs,"created_at"),uuid(rs,"updated_by"),time(rs,"updated_at"));
                },restaurant,id).stream().findFirst().orElseThrow(()->missing("SHOPPING_SHEET_NOT_FOUND"));
    }

    @Transactional
    public Sheet saveSheet(UUID restaurant, UUID id,String key,SheetInput input) {
        UUID actor=support.write(restaurant); support.lock(restaurant);
        if(input.shoppingDate()==null||input.shoppingDate().getYear()<1900||input.shoppingDate().getYear()>9998) throw invalid("SHOPPING_DATE_REQUIRED");
        List<Line> lines=prepareLines(restaurant,input.lines(),null,false);
        UUID result=support.once(restaurant,"shopping-sheet:"+id,key,input,()->{
            UUID target=id==null?UUID.randomUUID():id;
            if(id==null) jdbc.update("INSERT INTO public.accounting_shopping_sheets(id,restaurant_id,shopping_date,created_by,updated_by) VALUES (?,?,?,?,?)",target,restaurant,input.shoppingDate(),actor,actor);
            else {
                text(input.reason(),1000);
                if(Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM public.accounting_purchases WHERE restaurant_id=? AND sheet_id=?)",Boolean.class,restaurant,id))) throw conflict("SHOPPING_SHEET_ALREADY_POSTED");
                if(jdbc.update("UPDATE public.accounting_shopping_sheets SET shopping_date=?,updated_by=?,updated_at=now() WHERE restaurant_id=? AND id=?",input.shoppingDate(),actor,restaurant,id)!=1) throw missing("SHOPPING_SHEET_NOT_FOUND");
                jdbc.update("DELETE FROM public.accounting_shopping_lines WHERE restaurant_id=? AND sheet_id=?",restaurant,id);
            }
            for(Line line:lines) jdbc.update("INSERT INTO public.accounting_shopping_lines(id,restaurant_id,sheet_id,item_id,item_name,quantity,unit,unit_cost,line_total,supplier_id) VALUES (?,?,?,?,?,?,?,?,?,?)",
                    line.id(),restaurant,target,line.itemId(),line.itemName(),line.quantity(),line.unit(),line.unitCost(),line.lineTotal(),line.supplierId());
            support.audit(restaurant,actor,"SHOPPING_SHEET",target,id==null?"CREATE_PLAN":"CORRECT_PLAN",input.reason(),input);
            return target;
        });
        return sheet(restaurant,result);
    }

    @Transactional
    public PurchaseDetail confirmPurchase(UUID restaurant,String key,PurchaseInput input) {
        UUID actor=support.write(restaurant); support.lock(restaurant);
        validatePurchaseDate(restaurant,input.purchaseDate(),input.purchasedAt());
        if(input.dueDate()!=null && input.dueDate().isBefore(input.purchaseDate())) throw invalid("INVALID_PURCHASE_DUE_DATE");
        String supplier=supplierName(restaurant,input.supplierId());
        List<Line> lines=prepareLines(restaurant,input.lines(),input.supplierId(),true);
        long total=total(lines);
        UUID result=support.once(restaurant,"purchase-confirm",key,input,()->{
            if(input.sheetId()!=null) sheet(restaurant,input.sheetId());
            if(input.correctionOfId()!=null) {
                text(input.correctionReason(),1000);
                if(!"CANCELLED".equals(purchaseSummary(restaurant,input.correctionOfId()).status())) throw conflict("PURCHASE_CORRECTION_REQUIRES_CANCELLATION");
            }
            if(input.receiptId()!=null) validateReceipt(restaurant,input.receiptId());
            UUID id=UUID.randomUUID();
            jdbc.update("""
                    INSERT INTO public.accounting_purchases(id,restaurant_id,purchase_date,purchased_at,supplier_id,supplier_name,total_amount,sheet_id,due_date,receipt_id,invoice_reference,correction_of_id,created_by)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
                    """,id,restaurant,input.purchaseDate(),input.purchasedAt(),input.supplierId(),supplier,total,input.sheetId(),input.dueDate(),input.receiptId(),optional(input.invoiceReference(),150),input.correctionOfId(),actor);
            for(Line line:lines) jdbc.update("INSERT INTO public.accounting_purchase_lines(id,restaurant_id,purchase_id,item_id,item_name,quantity,unit,unit_cost,line_total) VALUES (?,?,?,?,?,?,?,?,?)",
                    line.id(),restaurant,id,line.itemId(),line.itemName(),line.quantity(),line.unit(),line.unitCost(),line.lineTotal());
            for(UUID item:lines.stream().map(Line::itemId).distinct().toList()) {
                if(jdbc.update("UPDATE public.accounting_shopping_items SET suggestion_enabled=true,updated_by=?,updated_at=now() WHERE restaurant_id=? AND id=? AND NOT suggestion_enabled",actor,restaurant,item)>0)
                    support.audit(restaurant,actor,"SHOPPING_ITEM",item,"REACTIVATE","Confirmed recorded purchase reactivated suggestions",Map.of("purchaseId",id));
            }
            support.audit(restaurant,actor,"PURCHASE",id,"CONFIRM",input.correctionReason(),input);
            return id;
        });
        return purchase(restaurant,result);
    }

    private void validateReceipt(UUID restaurant,UUID receipt) {
        if(!Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM public.accounting_receipts WHERE restaurant_id=? AND id=?)",Boolean.class,restaurant,receipt))) throw missing("ACCOUNTING_RECEIPT_NOT_FOUND");
    }

    public Page<PurchaseSummary> purchases(UUID restaurant,LocalDate from,LocalDate to,UUID supplier,String item,String paymentStatus,int page,int size) {
        return purchases(restaurant,from,to,supplier,item,paymentStatus,PurchaseSort.NEWEST,page,size);
    }

    public Page<PurchaseSummary> purchases(UUID restaurant,LocalDate from,LocalDate to,UUID supplier,String item,String paymentStatus,PurchaseSort sort,int page,int size) {
        support.read(restaurant); page(page,size);
        Filter filter=purchaseFilter(restaurant,from,to,supplier,item,paymentStatus);
        Map<String,Object> args=filter.args(); args.put("size",size);args.put("offset",(long)page*size);
        long count=named.queryForObject("SELECT count(*) FROM ("+SUMMARY+filter.sql()+") q",args,Long.class);
        String order = switch (sort) {
            case NEWEST -> "p.purchase_date DESC,p.purchased_at DESC,p.id";
            case OLDEST -> "p.purchase_date,p.purchased_at,p.id";
            case TOTAL_DESC -> "p.total_amount DESC,p.purchase_date DESC,p.purchased_at DESC,p.id";
        };
        List<PurchaseSummary> content=named.query(SUMMARY+filter.sql()+" ORDER BY "+order+" LIMIT :size OFFSET :offset",args,this::summary);
        return new Page<>(content,count,page,size);
    }

    public PurchaseDetail purchase(UUID restaurant,UUID id) {
        support.read(restaurant);
        PurchaseSummary summary=purchaseSummary(restaurant,id);
        List<Line> lines=jdbc.query("SELECT * FROM public.accounting_purchase_lines WHERE restaurant_id=? AND purchase_id=? ORDER BY id",this::purchaseLine,restaurant,id);
        List<Payment> payments=jdbc.query(PAYMENTS+" WHERE pp.restaurant_id=? AND pp.purchase_id=? ORDER BY pp.paid_at,pp.created_at,pp.id",this::payment,restaurant,id);
        List<Adjustment> cancellations=jdbc.query("SELECT * FROM public.accounting_purchase_cancellations WHERE restaurant_id=? AND purchase_id=? ORDER BY created_at,id",(rs,n)->new Adjustment(uuid(rs,"id"),rs.getString("reason"),uuid(rs,"created_by"),time(rs,"created_at")),restaurant,id);
        List<UUID> corrections=jdbc.query("SELECT id FROM public.accounting_purchases WHERE restaurant_id=? AND correction_of_id=? ORDER BY created_at,id",(rs,n)->uuid(rs,"id"),restaurant,id);
        return new PurchaseDetail(summary,lines,payments,cancellations,corrections);
    }

    @Transactional
    public PurchaseDetail cancelPurchase(UUID restaurant,UUID purchase,String key,ReasonInput input) {
        UUID actor=support.write(restaurant); support.lock(restaurant); String reason=text(input.reason(),1000);
        support.once(restaurant,"purchase-cancel:"+purchase,key,input,()->{
            PurchaseSummary original=purchaseSummary(restaurant,purchase);
            if("CANCELLED".equals(original.status())) throw conflict("PURCHASE_ALREADY_CANCELLED");
            if(original.amountPaid()!=0) throw conflict("REVERSE_PURCHASE_PAYMENTS_BEFORE_CANCELLATION");
            UUID id=UUID.randomUUID();
            jdbc.update("INSERT INTO public.accounting_purchase_cancellations(id,restaurant_id,purchase_id,reason,created_by) VALUES (?,?,?,?,?)",id,restaurant,purchase,reason,actor);
            support.audit(restaurant,actor,"PURCHASE",purchase,"CANCEL",reason,input);
            return id;
        });
        return purchase(restaurant,purchase);
    }

    @Transactional
    public PurchaseDetail payPurchase(UUID restaurant,UUID purchase,String key,PaymentInput input) {
        UUID actor=support.write(restaurant); support.lock(restaurant);
        if(input.amount()==null || input.amount()<=0) throw invalid("INVALID_PAYMENT_AMOUNT");
        String method=text(input.method(),30);
        if(!Set.of("CASH","BANK_TRANSFER","CARD","OTHER").contains(method)) throw invalid("INVALID_PAYMENT_METHOD");
        if(input.paidAt()==null || input.paidAt().isAfter(OffsetDateTime.now(ZoneOffset.UTC))) throw invalid("INVALID_PAYMENT_DATE");
        LocalDate paidDay=input.paidAt().atZoneSameInstant(support.zone(restaurant)).toLocalDate();
        support.once(restaurant,"purchase-payment:"+purchase,key,input,()->{
            support.assertOpenDay(restaurant,paidDay);
            PurchaseSummary original=purchaseSummary(restaurant,purchase);
            if("CANCELLED".equals(original.status())) throw conflict("CANCELLED_PURCHASE_PAYMENT");
            if(paidDay.isBefore(original.purchaseDate())) throw invalid("PAYMENT_BEFORE_PURCHASE");
            if(input.amount()>original.outstandingAmount()) throw conflict("PURCHASE_OVERPAYMENT");
            UUID id=UUID.randomUUID();
            jdbc.update("INSERT INTO public.accounting_purchase_payments(id,restaurant_id,purchase_id,amount,method,paid_at,created_by) VALUES (?,?,?,?,?,?,?)",id,restaurant,purchase,input.amount(),method,input.paidAt(),actor);
            support.audit(restaurant,actor,"PURCHASE_PAYMENT",id,"PAY",null,input);
            return id;
        });
        return purchase(restaurant,purchase);
    }

    @Transactional
    public PurchaseDetail reversePayment(UUID restaurant,UUID purchase,UUID payment,String key,ReasonInput input) {
        UUID actor=support.write(restaurant); support.lock(restaurant); String reason=text(input.reason(),1000);
        support.once(restaurant,"purchase-payment-reverse:"+payment,key,input,()->{
            // Capture the accounting event after acquiring the shared lock. Transaction-start time
            // can belong to yesterday when this request waited across a local midnight/closing.
            OffsetDateTime reversedAt=OffsetDateTime.now(ZoneOffset.UTC);
            support.assertOpenDay(restaurant,reversedAt.atZoneSameInstant(support.zone(restaurant)).toLocalDate());
            purchaseSummary(restaurant,purchase);
            List<Payment> matching=jdbc.query(PAYMENTS+" WHERE pp.restaurant_id=? AND pp.purchase_id=? AND pp.id=?",this::payment,restaurant,purchase,payment);
            if(matching.isEmpty()) throw missing("PURCHASE_PAYMENT_NOT_FOUND");
            if(matching.getFirst().reversalId()!=null) throw conflict("PURCHASE_PAYMENT_ALREADY_REVERSED");
            UUID id=UUID.randomUUID();
            jdbc.update("INSERT INTO public.accounting_purchase_payment_reversals(id,restaurant_id,payment_id,reason,created_by,created_at) VALUES (?,?,?,?,?,?)",id,restaurant,payment,reason,actor,reversedAt);
            support.audit(restaurant,actor,"PURCHASE_PAYMENT",payment,"REVERSE",reason,input);
            return id;
        });
        return purchase(restaurant,purchase);
    }

    public PurchaseReport report(UUID restaurant,LocalDate from,LocalDate to,UUID supplier,String item) {
        return report(restaurant,from,to,supplier,item,null);
    }

    public PurchaseReport report(UUID restaurant,LocalDate from,LocalDate to,UUID supplier,String item,String paymentStatus) {
        support.read(restaurant); var range=support.range(restaurant,from,to);
        Filter filter=purchaseFilter(restaurant,range.from(),range.to(),supplier,item,paymentStatus);
        List<MonthlyTotal> months=named.query("SELECT date_trunc('month',purchase_date)::date AS month,coalesce(sum(total_amount) FILTER(WHERE status='CONFIRMED'),0) AS amount,count(*) FILTER(WHERE status='CONFIRMED') AS count FROM ("+SUMMARY+filter.sql()+") q GROUP BY 1 ORDER BY 1",filter.args(),(rs,n)->new MonthlyTotal(rs.getObject("month",LocalDate.class),amount(rs,"amount"),rs.getLong("count")));
        return named.queryForObject("SELECT coalesce(sum(total_amount) FILTER(WHERE status='CONFIRMED'),0) AS confirmed,coalesce(sum(total_amount) FILTER(WHERE status='CANCELLED'),0) AS cancelled,count(*) FILTER(WHERE status='CONFIRMED') AS count FROM ("+SUMMARY+filter.sql()+") q",filter.args(),(rs,n)->new PurchaseReport(range.from(),range.to(),amount(rs,"confirmed"),amount(rs,"cancelled"),rs.getLong("count"),months));
    }

    public Page<Payable> payables(UUID restaurant,int page,int size) {
        return payables(restaurant,null,PayableSort.NAME_ASC,page,size);
    }

    public Page<Payable> payables(UUID restaurant,String search,PayableSort sort,int page,int size) {
        support.read(restaurant);page(page,size);
        String pattern = searchPattern(search);
        long count=jdbc.queryForObject("SELECT count(*) FROM public.accounting_suppliers WHERE restaurant_id=? AND name ILIKE ?",Long.class,restaurant,pattern);
        String order = switch (sort) {
            case NAME_ASC -> "s.name,s.id";
            case OUTSTANDING_DESC -> "outstanding DESC,s.name,s.id";
            case DUE_ASC -> "due NULLS LAST,s.name,s.id";
        };
        String sql="""
                SELECT s.id,s.name,coalesce(sum(q.total_amount) FILTER(WHERE q.status='CONFIRMED'),0) AS obligations,
                  coalesce(sum(q.amount_paid),0) AS paid,coalesce(sum(q.outstanding_amount),0) AS outstanding,
                  min(q.due_date) FILTER(WHERE q.outstanding_amount>0) AS due
                FROM public.accounting_suppliers s LEFT JOIN (
                """+SUMMARY+" WHERE p.restaurant_id=:r) q ON q.supplier_id=s.id WHERE s.restaurant_id=:r AND s.name ILIKE :search GROUP BY s.id,s.name ORDER BY "+order+" LIMIT :size OFFSET :offset";
        return new Page<>(named.query(sql,Map.of("r",restaurant,"search",pattern,"size",size,"offset",(long)page*size),(rs,n)->new Payable(uuid(rs,"id"),rs.getString("name"),amount(rs,"obligations"),amount(rs,"paid"),amount(rs,"outstanding"),rs.getObject("due",LocalDate.class))),count,page,size);
    }

    public Page<SupplierPayment> supplierPayments(UUID restaurant,UUID supplier,int page,int size) {
        support.read(restaurant);page(page,size);findSupplier(restaurant,supplier);
        long count=jdbc.queryForObject("SELECT count(*) FROM public.accounting_purchase_payments pp JOIN public.accounting_purchases p ON p.restaurant_id=pp.restaurant_id AND p.id=pp.purchase_id WHERE pp.restaurant_id=? AND p.supplier_id=?",Long.class,restaurant,supplier);
        String sql=PAYMENTS.replace("SELECT pp.*", "SELECT pp.*,p.id AS purchase_id,p.invoice_reference")+" JOIN public.accounting_purchases p ON p.restaurant_id=pp.restaurant_id AND p.id=pp.purchase_id WHERE pp.restaurant_id=? AND p.supplier_id=? ORDER BY pp.paid_at DESC,pp.id LIMIT ? OFFSET ?";
        return new Page<>(jdbc.query(sql,(rs,n)->new SupplierPayment(uuid(rs,"purchase_id"),rs.getString("invoice_reference"),payment(rs,n)),restaurant,supplier,size,(long)page*size),count,page,size);
    }

    public String export(UUID restaurant,LocalDate from,LocalDate to,UUID supplier,String item,String paymentStatus) {
        support.read(restaurant);Filter filter=purchaseFilter(restaurant,from,to,supplier,item,paymentStatus);
        String sql="""
                SELECT q.*,l.item_id,l.item_name,l.quantity,l.unit,l.unit_cost,l.line_total,
                  row_number() OVER(PARTITION BY q.id ORDER BY l.id) AS purchase_row,
                  (SELECT coalesce(jsonb_agg(jsonb_build_object('paymentId',pp.id,'amount',pp.amount::text,'method',pp.method,
                    'paidAt',pp.paid_at,'recordedBy',pp.created_by,'recordedAt',pp.created_at,'reversedAt',pr.created_at,
                    'reversedBy',pr.created_by,'reversalReason',pr.reason) ORDER BY pp.paid_at,pp.created_at,pp.id),'[]'::jsonb)::text
                   FROM public.accounting_purchase_payments pp LEFT JOIN public.accounting_purchase_payment_reversals pr
                     ON pr.restaurant_id=pp.restaurant_id AND pr.payment_id=pp.id WHERE pp.restaurant_id=q.restaurant_id AND pp.purchase_id=q.id) AS payment_history,
                  (SELECT coalesce(jsonb_agg(jsonb_build_object('cancelledAt',c.created_at,'cancelledBy',c.created_by,'reason',c.reason)),'[]'::jsonb)::text
                   FROM public.accounting_purchase_cancellations c WHERE c.restaurant_id=q.restaurant_id AND c.purchase_id=q.id) AS cancellation_history
                FROM (
                """+SUMMARY+filter.sql()+") q JOIN public.accounting_purchase_lines l ON l.restaurant_id=q.restaurant_id AND l.purchase_id=q.id ORDER BY q.purchase_date,q.purchased_at,q.id,l.id LIMIT 10001";
        List<String> rows=named.query(sql,filter.args(),(rs,n)->{
            boolean first=rs.getLong("purchase_row")==1;
            return String.join(",",List.of(csv(rs.getString("id")),csv(rs.getObject("purchase_date")),csv(rs.getObject("purchased_at")),csv(rs.getString("item_id")),csv(rs.getString("item_name")),csv(rs.getBigDecimal("quantity")),csv(rs.getString("unit")),csv(amount(rs,"unit_cost")),csv(amount(rs,"line_total")),csv(first?amount(rs,"total_amount"):null),csv(rs.getString("supplier_name")),csv(first?amount(rs,"amount_paid"):null),csv(first?amount(rs,"outstanding_amount"):null),csv(rs.getString("payment_status")),csv(rs.getString("status")),csv(rs.getString("created_by")),csv(rs.getString("invoice_reference")),csv(rs.getString("receipt_id")),csv(rs.getString("correction_of_id")),csv(first?rs.getString("payment_history"):null),csv(first?rs.getString("cancellation_history"):null)));
        });
        if(rows.size()>10000) throw invalid("EXPORT_TOO_LARGE_USE_SHORTER_RANGE");
        return "purchase_id,purchase_date,purchased_at,item_id,historical_item_name,quantity,unit,historical_unit_cost,line_total,purchase_total,supplier,amount_paid,outstanding,payment_status,status,recorded_by,invoice_reference,receipt_id,correction_of_id,payment_history_json,cancellation_history_json\r\n"+String.join("\r\n",rows)+"\r\n";
    }

    private Filter purchaseFilter(UUID restaurant,LocalDate from,LocalDate to,UUID supplier,String item,String status) {
        var range=support.range(restaurant,from,to);
        Map<String,Object> args=new HashMap<>();args.put("r",restaurant);args.put("from",range.from());args.put("to",range.to());
        String sql=" WHERE p.restaurant_id=:r AND p.purchase_date BETWEEN :from AND :to";
        if(supplier!=null){sql+=" AND p.supplier_id=:supplier";args.put("supplier",supplier);}
        if(item!=null && !item.isBlank()){sql+=" AND EXISTS(SELECT 1 FROM public.accounting_purchase_lines l WHERE l.restaurant_id=p.restaurant_id AND l.purchase_id=p.id AND l.item_name ILIKE :item)";args.put("item",searchPattern(item));}
        if(status!=null && !status.isBlank()) {
            if(!Set.of("PAID","UNPAID","PARTIALLY_PAID").contains(status)) throw invalid("INVALID_PAYMENT_STATUS");
            args.put("paymentStatus",status);
            sql+=" AND (CASE WHEN coalesce(paid.amount,0)>=p.total_amount THEN 'PAID' WHEN coalesce(paid.amount,0)=0 THEN 'UNPAID' ELSE 'PARTIALLY_PAID' END)=:paymentStatus";
        }
        return new Filter(sql,args);
    }

    private PurchaseSummary purchaseSummary(UUID restaurant,UUID id) {
        return named.query(SUMMARY+" WHERE p.restaurant_id=:r AND p.id=:id",Map.of("r",restaurant,"id",id),this::summary).stream().findFirst().orElseThrow(()->missing("PURCHASE_NOT_FOUND"));
    }
    private static final String SUMMARY="""
            SELECT p.*,coalesce(paid.amount,0) AS amount_paid,
              CASE WHEN c.id IS NULL THEN p.total_amount-coalesce(paid.amount,0) ELSE 0 END AS outstanding_amount,
              CASE WHEN coalesce(paid.amount,0)>=p.total_amount THEN 'PAID' WHEN coalesce(paid.amount,0)=0 THEN 'UNPAID' ELSE 'PARTIALLY_PAID' END AS payment_status,
              CASE WHEN c.id IS NULL THEN 'CONFIRMED' ELSE 'CANCELLED' END AS status
            FROM public.accounting_purchases p
            LEFT JOIN public.accounting_purchase_cancellations c ON c.restaurant_id=p.restaurant_id AND c.purchase_id=p.id
            LEFT JOIN LATERAL (SELECT sum(pp.amount) AS amount FROM public.accounting_purchase_payments pp
              WHERE pp.restaurant_id=p.restaurant_id AND pp.purchase_id=p.id AND NOT EXISTS(
                SELECT 1 FROM public.accounting_purchase_payment_reversals pr WHERE pr.restaurant_id=pp.restaurant_id AND pr.payment_id=pp.id)) paid ON true
            """;
    private static final String PAYMENTS="""
            SELECT pp.*,pr.id AS reversal_id,pr.reason AS reversal_reason,pr.created_by AS reversed_by,pr.created_at AS reversed_at
            FROM public.accounting_purchase_payments pp LEFT JOIN public.accounting_purchase_payment_reversals pr
              ON pr.restaurant_id=pp.restaurant_id AND pr.payment_id=pp.id
            """;
    private PurchaseSummary summary(ResultSet rs,int n)throws SQLException {
        return new PurchaseSummary(uuid(rs,"id"),rs.getObject("purchase_date",LocalDate.class),time(rs,"purchased_at"),uuid(rs,"supplier_id"),rs.getString("supplier_name"),amount(rs,"total_amount"),amount(rs,"amount_paid"),amount(rs,"outstanding_amount"),rs.getString("payment_status"),rs.getString("status"),rs.getObject("due_date",LocalDate.class),rs.getString("invoice_reference"),uuid(rs,"receipt_id"),uuid(rs,"correction_of_id"),uuid(rs,"created_by"),time(rs,"created_at"));
    }
    private Supplier findSupplier(UUID restaurant,UUID id) {
        return jdbc.query("SELECT * FROM public.accounting_suppliers WHERE restaurant_id=? AND id=?",this::supplier,restaurant,id).stream().findFirst().orElseThrow(()->missing("SUPPLIER_NOT_FOUND"));
    }
    private Supplier supplier(ResultSet rs,int n)throws SQLException {
        return new Supplier(uuid(rs,"id"),rs.getString("name"),rs.getString("contact"),rs.getBoolean("active"),uuid(rs,"created_by"),time(rs,"created_at"),uuid(rs,"updated_by"),time(rs,"updated_at"));
    }
    private String supplierName(UUID restaurant,UUID id){return id==null?null:findSupplier(restaurant,id).name();}
    private Line purchaseLine(ResultSet rs,int n)throws SQLException{return new Line(uuid(rs,"id"),uuid(rs,"item_id"),rs.getString("item_name"),rs.getBigDecimal("quantity"),rs.getString("unit"),rs.getLong("unit_cost"),rs.getLong("line_total"),null);}
    private Line planLine(ResultSet rs,int n)throws SQLException{return new Line(uuid(rs,"id"),uuid(rs,"item_id"),rs.getString("item_name"),rs.getBigDecimal("quantity"),rs.getString("unit"),rs.getLong("unit_cost"),rs.getLong("line_total"),uuid(rs,"supplier_id"));}
    private Payment payment(ResultSet rs,int n)throws SQLException{return new Payment(uuid(rs,"id"),rs.getLong("amount"),rs.getString("method"),time(rs,"paid_at"),uuid(rs,"created_by"),time(rs,"created_at"),uuid(rs,"reversal_id"),rs.getString("reversal_reason"),uuid(rs,"reversed_by"),time(rs,"reversed_at"));}
    private static UUID uuid(ResultSet rs,String key)throws SQLException{return rs.getObject(key,UUID.class);}
    private static OffsetDateTime time(ResultSet rs,String key)throws SQLException{return rs.getObject(key,OffsetDateTime.class);}
    private static long amount(ResultSet rs,String key)throws SQLException{return whole(rs.getBigDecimal(key));}
    private static String text(String value,int max){if(value==null||value.isBlank()||value.length()>max) throw invalid("INVALID_PROCUREMENT_TEXT");return value.trim();}
    private static String optional(String value,int max){return value==null||value.isBlank()?null:text(value,max);}
    private static String searchPattern(String value){if(value!=null&&value.length()>150)throw invalid("SEARCH_TOO_LONG");return "%"+(value==null?"":value.trim())+"%";}
    private record Filter(String sql,Map<String,Object> args) { }

    List<Line> prepareLines(UUID restaurant,List<LineInput> inputs,UUID supplier,boolean purchase) {
        if(inputs==null||inputs.isEmpty()||inputs.size()>200)throw invalid("INVALID_PURCHASE_LINES");
        List<Line> lines=new ArrayList<>();
        for(LineInput input:inputs) {
            if(input==null||input.itemId()==null)throw invalid("SHOPPING_ITEM_REQUIRED");
            Item item=itemById(restaurant,input.itemId());
            String unit=text(input.unit(),30);quantity(input.quantity());
            if(input.unitCost()==null||input.unitCost()<0)throw invalid("INVALID_UNIT_COST");
            if(purchase && input.supplierId()!=null && !Objects.equals(input.supplierId(),supplier)) throw invalid("PURCHASE_SUPPLIER_MISMATCH");
            supplierName(restaurant,input.supplierId());
            lines.add(new Line(UUID.randomUUID(),input.itemId(),item.name(),input.quantity(),unit,input.unitCost(),lineTotal(input.quantity(),input.unitCost()),input.supplierId()));
        }
        total(lines);return lines;
    }
    static long lineTotal(BigDecimal quantity,long unitCost) {
        quantity(quantity);if(unitCost<0)throw invalid("INVALID_UNIT_COST");
        try{return quantity.multiply(BigDecimal.valueOf(unitCost)).longValueExact();}
        catch(ArithmeticException exception){throw invalid("LINE_TOTAL_MUST_BE_WHOLE_CURRENCY");}
    }
    static void quantity(BigDecimal value) {
        if(value==null||value.signum()<=0||value.scale()>6||value.precision()-value.scale()>12)throw invalid("INVALID_PURCHASE_QUANTITY");
    }
    private static long total(List<Line> lines){try{long total=0;for(Line line:lines)total=Math.addExact(total,line.lineTotal());return total;}catch(ArithmeticException exception){throw invalid("PURCHASE_TOTAL_OVERFLOW");}}
    static boolean eligible(LocalDate today,LocalDate lastPurchase,boolean enabled){if(!enabled||lastPurchase==null)return false;long age=ChronoUnit.DAYS.between(lastPurchase,today);return age>=0&&age<=6;}
    private void validatePurchaseDate(UUID restaurant,LocalDate date,OffsetDateTime purchasedAt) {
        if(date==null||date.getYear()<1900||date.getYear()>9998||purchasedAt==null||date.isAfter(support.today(restaurant))||purchasedAt.isAfter(OffsetDateTime.now(ZoneOffset.UTC))||!purchasedAt.atZoneSameInstant(support.zone(restaurant)).toLocalDate().equals(date))throw invalid("INVALID_PURCHASE_DATE");
    }
}
