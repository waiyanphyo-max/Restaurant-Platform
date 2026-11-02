package com.restaurant.platform.accounting;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Isolation;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.util.*;
import static com.restaurant.platform.accounting.AccountingSupport.*;
import static com.restaurant.platform.accounting.ExpenseDtos.*;

@Service
@Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
public class ExpenseService {
    private final JdbcTemplate jdbc;
    private final AccountingSupport support;
    public ExpenseService(JdbcTemplate jdbc, AccountingSupport support) { this.jdbc=jdbc; this.support=support; }

    private static final String SELECT = """
        SELECT e.*, c.created_at cancelled_at,c.reason cancellation_reason,c.created_by cancelled_by,
          COALESCE((SELECT SUM(p.amount) FROM public.accounting_expense_payments p
            WHERE p.restaurant_id=e.restaurant_id AND p.expense_id=e.id AND NOT EXISTS
              (SELECT 1 FROM public.accounting_expense_payment_reversals r WHERE r.restaurant_id=p.restaurant_id AND r.payment_id=p.id)),0) paid
        FROM public.accounting_expenses e LEFT JOIN public.accounting_expense_cancellations c
          ON c.restaurant_id=e.restaurant_id AND c.expense_id=e.id
        """;
    private static final RowMapper<Expense> MAPPER=(rs,n)->expense(rs);
    private static Expense expense(ResultSet rs) throws SQLException {
        long amount=rs.getLong("amount"),paid=rs.getLong("paid");
        boolean cancelled=rs.getObject("cancelled_at")!=null;
        return new Expense(rs.getObject("id",UUID.class),Category.valueOf(rs.getString("category")),amount,
          rs.getObject("expense_date",LocalDate.class),rs.getString("description"),rs.getString("payee"),
          rs.getObject("receipt_id",UUID.class),rs.getObject("template_id",UUID.class),paid,cancelled?0:Math.subtractExact(amount,paid),
          cancelled?"CANCELLED":paid==0?"UNPAID":paid==amount?"PAID":"PARTIALLY_PAID",
          rs.getObject("created_by",UUID.class),rs.getObject("created_at",OffsetDateTime.class),
          rs.getObject("cancelled_at",OffsetDateTime.class),rs.getString("cancellation_reason"),rs.getObject("cancelled_by",UUID.class));
    }
    public Expense get(UUID restaurant,UUID id) {
        support.read(restaurant);
        return jdbc.query(SELECT+" WHERE e.restaurant_id=? AND e.id=?",MAPPER,restaurant,id).stream().findFirst().orElseThrow(()->missing("EXPENSE_NOT_FOUND"));
    }
    public Detail detail(UUID restaurant,UUID id) {
        Expense item=get(restaurant,id);
        var payments=jdbc.query("""
            SELECT p.*,r.created_at reversed_at,r.reason reversal_reason,r.created_by reversed_by
            FROM public.accounting_expense_payments p LEFT JOIN public.accounting_expense_payment_reversals r
              ON r.restaurant_id=p.restaurant_id AND r.payment_id=p.id
            WHERE p.restaurant_id=? AND p.expense_id=? ORDER BY p.paid_at,p.id
            """,(rs,n)->new Payment(rs.getObject("id",UUID.class),rs.getLong("amount"),Method.valueOf(rs.getString("method")),
              rs.getObject("paid_at",OffsetDateTime.class),rs.getObject("created_by",UUID.class),rs.getObject("created_at",OffsetDateTime.class),
              rs.getObject("reversed_at",OffsetDateTime.class),rs.getString("reversal_reason"),rs.getObject("reversed_by",UUID.class)),restaurant,id);
        return new Detail(item,payments);
    }
    public Page<Expense> list(UUID restaurant,LocalDate from,LocalDate to,Category category,String query,String status,int page,int size) {
        support.read(restaurant); page(page,size); var range=support.range(restaurant,from,to);
        if(status!=null&&!Set.of("UNPAID","PARTIALLY_PAID","PAID","CANCELLED").contains(status)) throw invalid("INVALID_EXPENSE_STATUS");
        String filter=" WHERE e.restaurant_id=? AND e.expense_date BETWEEN ? AND ?";
        var args=new ArrayList<Object>(List.of(restaurant,range.from(),range.to()));
        if(category!=null) {filter+=" AND e.category=?";args.add(category.name());}
        if(query!=null&&!query.isBlank()) {if(query.length()>200)throw invalid("INVALID_EXPENSE_SEARCH");filter+=" AND (e.description ILIKE ? OR e.payee ILIKE ?)";args.add("%"+query+"%");args.add("%"+query+"%");}
        String selected="SELECT x.* FROM ("+SELECT+filter+") x";
        if(status!=null) selected+=" WHERE "+switch(status) {
            case "CANCELLED"->"x.cancelled_at IS NOT NULL";
            case "UNPAID"->"x.cancelled_at IS NULL AND x.paid=0";
            case "PAID"->"x.cancelled_at IS NULL AND x.paid=x.amount";
            default->"x.cancelled_at IS NULL AND x.paid>0 AND x.paid<x.amount";
        };
        Long total=jdbc.queryForObject("SELECT COUNT(*) FROM ("+selected+") counted",Long.class,args.toArray());
        args.add(size);args.add(Math.multiplyExact(page,size));
        return new Page<>(jdbc.query(selected+" ORDER BY expense_date DESC,created_at DESC,id LIMIT ? OFFSET ?",MAPPER,args.toArray()),total==null?0:total,page,size);
    }
    @Transactional
    public Expense create(UUID restaurant,String key,Create request) {
        UUID actor=support.write(restaurant);
        UUID id=support.once(restaurant,"expense.create",key,request,()->insert(restaurant,actor,request,null));
        return get(restaurant,id);
    }
    private UUID insert(UUID restaurant,UUID actor,Create r,UUID template) {
        validateCreate(restaurant,r);
        if(r.receiptId()!=null&&!Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM public.accounting_receipts WHERE restaurant_id=? AND id=?)",Boolean.class,restaurant,r.receiptId()))) throw missing("RECEIPT_NOT_FOUND");
        UUID id=UUID.randomUUID();
        jdbc.update("""
          INSERT INTO public.accounting_expenses(id,restaurant_id,category,amount,expense_date,description,payee,receipt_id,template_id,created_by)
          VALUES(?,?,?,?,?,?,?,?,?,?)
          """,id,restaurant,r.category().name(),r.amount(),r.expenseDate(),r.description().trim(),r.payee(),r.receiptId(),template,actor);
        support.audit(restaurant,actor,"EXPENSE",id,"POST",null,r); return id;
    }
    private void validateCreate(UUID restaurant,Create r) {
        if(r==null||r.category()==null||r.amount()==null||r.amount()<=0||r.expenseDate()==null||r.expenseDate().isAfter(support.today(restaurant))
          ||r.expenseDate().getYear()<1900||r.description()==null||r.description().isBlank()||r.description().length()>2000||(r.payee()!=null&&r.payee().length()>200)) throw invalid("INVALID_EXPENSE");
    }
    @Transactional
    public Detail pay(UUID restaurant,UUID expense,String key,Pay r) {
        UUID actor=support.write(restaurant);
        support.once(restaurant,"expense.pay."+expense,key,r,()->{
            if(r==null||r.amount()==null||r.amount()<=0||r.method()==null||r.paidAt()==null||r.paidAt().isAfter(OffsetDateTime.now())) throw invalid("INVALID_EXPENSE_PAYMENT");
            Expense current=get(restaurant,expense);
            if(current.cancelledAt()!=null||r.amount()>current.outstandingAmount()) throw conflict("EXPENSE_PAYMENT_EXCEEDS_BALANCE");
            LocalDate date=r.paidAt().atZoneSameInstant(support.zone(restaurant)).toLocalDate();
            if(date.getYear()<1900) throw invalid("INVALID_EXPENSE_PAYMENT_DATE");
            if(r.method()==Method.CASH) support.assertOpenDay(restaurant,date);
            UUID id=UUID.randomUUID();
            jdbc.update("INSERT INTO public.accounting_expense_payments(id,restaurant_id,expense_id,amount,method,paid_at,created_by) VALUES(?,?,?,?,?,?,?)",
              id,restaurant,expense,r.amount(),r.method().name(),r.paidAt(),actor);
            support.audit(restaurant,actor,"EXPENSE_PAYMENT",id,"PAY",null,r);return id;
        });return detail(restaurant,expense);
    }
    @Transactional
    public Detail reversePayment(UUID restaurant,UUID expense,UUID payment,String key,Reason r) {
        UUID actor=support.write(restaurant);reason(r);
        support.once(restaurant,"expense.reverse."+payment,key,r,()->{
            Payment current=detail(restaurant,expense).payments().stream().filter(p->p.id().equals(payment)).findFirst().orElseThrow(()->missing("EXPENSE_PAYMENT_NOT_FOUND"));
            if(current.reversedAt()!=null)throw conflict("EXPENSE_PAYMENT_ALREADY_REVERSED");
            OffsetDateTime reversedAt=OffsetDateTime.now(java.time.ZoneOffset.UTC);
            if(current.method()==Method.CASH)support.assertOpenDay(restaurant,reversedAt.atZoneSameInstant(support.zone(restaurant)).toLocalDate());
            UUID id=UUID.randomUUID();
            jdbc.update("INSERT INTO public.accounting_expense_payment_reversals(id,restaurant_id,payment_id,reason,created_by,created_at) VALUES(?,?,?,?,?,?)",id,restaurant,payment,r.reason().trim(),actor,reversedAt);
            support.audit(restaurant,actor,"EXPENSE_PAYMENT",payment,"REVERSE",r.reason(),r);return id;
        }); return detail(restaurant,expense);
    }
    @Transactional
    public Expense cancel(UUID restaurant,UUID expense,String key,Reason r) {
        UUID actor=support.write(restaurant);reason(r);
        support.once(restaurant,"expense.cancel."+expense,key,r,()->{
            Expense current=get(restaurant,expense);
            if(current.cancelledAt()!=null)throw conflict("EXPENSE_ALREADY_CANCELLED");
            if(current.paidAmount()!=0)throw conflict("REVERSE_EXPENSE_PAYMENTS_FIRST");
            UUID id=UUID.randomUUID();
            jdbc.update("INSERT INTO public.accounting_expense_cancellations(id,restaurant_id,expense_id,reason,created_by) VALUES(?,?,?,?,?)",id,restaurant,expense,r.reason().trim(),actor);
            support.audit(restaurant,actor,"EXPENSE",expense,"CANCEL",r.reason(),r);return id;
        }); return get(restaurant,expense);
    }
    public Report report(UUID restaurant,LocalDate from,LocalDate to,Period period) {
        support.read(restaurant);var range=support.range(restaurant,from,to);
        Period selected=period==null?Period.DAY:period;
        String unit=selected.name().toLowerCase(Locale.ROOT);
        var totals=jdbc.query("""
          SELECT date_trunc('%s',e.expense_date)::date period_start,e.category,
          SUM(e.amount)::numeric posted,COALESCE(SUM(e.amount) FILTER(WHERE c.expense_id IS NOT NULL),0)::numeric cancelled,
          COALESCE(SUM(e.amount) FILTER(WHERE c.expense_id IS NULL),0)::numeric expense
          FROM public.accounting_expenses e LEFT JOIN public.accounting_expense_cancellations c ON c.restaurant_id=e.restaurant_id AND c.expense_id=e.id
          WHERE e.restaurant_id=? AND e.expense_date BETWEEN ? AND ? GROUP BY 1,2 ORDER BY 1,2
          """.formatted(unit),(rs,n)->new Total(rs.getObject("period_start",LocalDate.class),Category.valueOf(rs.getString("category")),whole(rs.getBigDecimal("posted")),whole(rs.getBigDecimal("cancelled")),whole(rs.getBigDecimal("expense"))),restaurant,range.from(),range.to());
        return new Report(range.from(),range.to(),selected,totals);
    }
    public List<Template> templates(UUID restaurant) {
        support.read(restaurant);
        return jdbc.query("""
          SELECT t.*,NOT EXISTS(SELECT 1 FROM public.accounting_expense_template_stops s WHERE s.restaurant_id=t.restaurant_id AND s.template_id=t.id) active
          FROM public.accounting_expense_templates t WHERE restaurant_id=? ORDER BY created_at,id LIMIT 1000
          """,(rs,n)->template(rs),restaurant);
    }
    private Template getTemplate(UUID restaurant,UUID id) {
        return jdbc.query("""
          SELECT t.*,NOT EXISTS(SELECT 1 FROM public.accounting_expense_template_stops s WHERE s.restaurant_id=t.restaurant_id AND s.template_id=t.id) active
          FROM public.accounting_expense_templates t WHERE restaurant_id=? AND id=?
          """,(rs,n)->template(rs),restaurant,id).stream().findFirst().orElseThrow(()->missing("EXPENSE_TEMPLATE_NOT_FOUND"));
    }
    private static Template template(ResultSet rs) throws SQLException {
        return new Template(rs.getObject("id",UUID.class),Category.valueOf(rs.getString("category")),rs.getLong("amount"),rs.getString("description"),rs.getString("payee"),Frequency.valueOf(rs.getString("frequency")),rs.getObject("starts_on",LocalDate.class),rs.getBoolean("active"),rs.getObject("created_by",UUID.class),rs.getObject("created_at",OffsetDateTime.class));
    }
    @Transactional
    public UUID createTemplate(UUID restaurant,String key,CreateTemplate r) {
        UUID actor=support.write(restaurant);
        return support.once(restaurant,"expense.template.create",key,r,()->{
            if(r==null||r.frequency()==null||r.startsOn()==null)throw invalid("INVALID_EXPENSE_TEMPLATE");
            validateCreate(restaurant,new Create(r.category(),r.amount(),support.today(restaurant),r.description(),r.payee(),null));
            if(r.startsOn().getYear()<1900||r.startsOn().getYear()>9998)throw invalid("INVALID_EXPENSE_TEMPLATE_DATE");
            UUID id=UUID.randomUUID();
            jdbc.update("INSERT INTO public.accounting_expense_templates(id,restaurant_id,category,amount,description,payee,frequency,starts_on,created_by) VALUES(?,?,?,?,?,?,?,?,?)",id,restaurant,r.category().name(),r.amount(),r.description().trim(),r.payee(),r.frequency().name(),r.startsOn(),actor);
            support.audit(restaurant,actor,"EXPENSE_TEMPLATE",id,"CREATE",null,r);return id;
        });
    }
    @Transactional
    public Expense confirmTemplate(UUID restaurant,UUID template,String key,Confirm r) {
        UUID actor=support.write(restaurant);
        UUID id=support.once(restaurant,"expense.template.post."+template,key,r,()->{
            Template t=getTemplate(restaurant,template);
            if(!t.active())throw conflict("EXPENSE_TEMPLATE_STOPPED");
            if(r==null||!isOccurrence(t.startsOn(),t.frequency(),r.expenseDate()))throw invalid("INVALID_EXPENSE_TEMPLATE_OCCURRENCE");
            if(Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM public.accounting_expenses WHERE restaurant_id=? AND template_id=? AND expense_date=?)",Boolean.class,restaurant,template,r.expenseDate())))throw conflict("EXPENSE_TEMPLATE_ALREADY_POSTED");
            return insert(restaurant,actor,new Create(t.category(),t.amount(),r.expenseDate(),t.description(),t.payee(),null),template);
        });return get(restaurant,id);
    }
    @Transactional
    public UUID stopTemplate(UUID restaurant,UUID template,String key,Reason r) {
        UUID actor=support.write(restaurant);reason(r);
        return support.once(restaurant,"expense.template.stop."+template,key,r,()->{
            Template t=getTemplate(restaurant,template);
            if(!t.active())throw conflict("EXPENSE_TEMPLATE_STOPPED");UUID id=UUID.randomUUID();
            jdbc.update("INSERT INTO public.accounting_expense_template_stops(id,restaurant_id,template_id,reason,created_by) VALUES(?,?,?,?,?)",id,restaurant,template,r.reason().trim(),actor);
            support.audit(restaurant,actor,"EXPENSE_TEMPLATE",template,"STOP",r.reason(),r);return id;
        });
    }
    static boolean isOccurrence(LocalDate start,Frequency frequency,LocalDate date) {
        if(date==null||date.isBefore(start))return false;
        if(frequency==Frequency.MONTHLY)return start.plusMonths(java.time.temporal.ChronoUnit.MONTHS.between(YearMonth.from(start),YearMonth.from(date))).equals(date);
        return start.plusYears(date.getYear()-start.getYear()).equals(date);
    }
    static void reason(Reason r) { if(r==null||r.reason()==null||r.reason().isBlank()||r.reason().length()>2000)throw invalid("CORRECTION_REASON_REQUIRED"); }
}
