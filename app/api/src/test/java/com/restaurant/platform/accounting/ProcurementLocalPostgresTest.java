package com.restaurant.platform.accounting;

import static com.restaurant.platform.accounting.ProcurementDtos.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.List;
import java.util.ArrayList;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;
import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.entity.RestaurantSettings;
import com.restaurant.platform.repository.RestaurantSettingsRepository;
import com.restaurant.platform.security.RestaurantAuthorization;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

/** Exercises every procurement query family against reviewed migrations in an opt-in disposable database. */
@EnabledIfEnvironmentVariable(named="ACCOUNTING_TEST_DATABASE_URL",matches="jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/accounting_verify")
class ProcurementLocalPostgresTest {
    @Test void multiLineCsvEmitsPurchaseTotalsAndPaymentHistoryOnce() {
        var f=new Fixture();
        var item=f.tx(()->f.service.saveItem(f.restaurant,null,"csv-item",new ItemInput("CSV item","pack",BigDecimal.ONE,null,true,null)));
        var purchase=f.tx(()->f.service.confirmPurchase(f.restaurant,"csv-purchase",new PurchaseInput(f.today,f.now.minusMinutes(1),null,
                List.of(new LineInput(item.id(),BigDecimal.ONE,"pack",100L,null),new LineInput(item.id(),BigDecimal.ONE,"pack",200L,null)),null,null,null,null,null,null)));
        f.tx(()->f.service.payPurchase(f.restaurant,purchase.purchase().id(),"csv-payment",new PaymentInput(50L,"CASH",f.now)));
        String[] rows=f.service.export(f.restaurant,f.today,f.today,null,null,null).split("\r\n");
        assertEquals(3,rows.length);
        var first=parseCsvRow(rows[1]);var second=parseCsvRow(rows[2]);
        assertEquals("300",first.get(9));assertEquals("50",first.get(11));assertEquals("250",first.get(12));
        assertFalse(first.get(19).isEmpty());
        assertEquals("",second.get(9));assertEquals("",second.get(11));assertEquals("",second.get(12));assertEquals("",second.get(19));assertEquals("",second.get(20));
        assertEquals(300,Long.parseLong(first.get(8))+Long.parseLong(second.get(8)));
    }

    private static List<String> parseCsvRow(String row) {
        List<String> values=new ArrayList<>();StringBuilder value=new StringBuilder();boolean quoted=false;
        for(int i=0;i<row.length();i++) {
            char next=row.charAt(i);
            if(next=='"') {
                if(quoted&&i+1<row.length()&&row.charAt(i+1)=='"'){value.append('"');i++;}else quoted=!quoted;
            } else if(next==','&&!quoted){values.add(value.toString());value.setLength(0);}else value.append(next);
        }
        values.add(value.toString());return values;
    }

    @Test void plansSupplierPaymentsFiltersExportsAndCorrectionsRemainConsistent() {
        var f=new Fixture();
        var supplier=f.tx(()->f.service.saveSupplier(f.restaurant,null,"supplier",new SupplierInput("Local supplier","01234",true,null)));
        assertEquals(1,f.service.suppliers(f.restaurant,"Local",0,20).totalElements());
        var item=f.tx(()->f.service.saveItem(f.restaurant,null,"item",new ItemInput("Rice","kg",BigDecimal.ONE,supplier.id(),false,null)));
        var lines=List.of(new LineInput(item.id(),new BigDecimal("2.5"),"kg",100L,supplier.id()));
        var plan=f.tx(()->f.service.saveSheet(f.restaurant,null,"sheet",new SheetInput(f.today,lines,null)));
        assertEquals("PLANNED",plan.status());assertEquals(0,f.count("accounting_purchases"));
        UUID sheetId=plan.id();
        f.tx(()->f.service.saveSheet(f.restaurant,sheetId,"sheet-correction",new SheetInput(f.today,lines,"Confirm planned quantity")));
        assertEquals(1,f.service.sheets(f.restaurant,f.today,f.today,0,20).totalElements());
        var body=new PurchaseInput(f.today,f.now.minusMinutes(1),supplier.id(),lines,sheetId,f.today.plusDays(7),null,"INV-ONE",null,null);
        var purchase=f.tx(()->f.service.confirmPurchase(f.restaurant,"confirm",body));
        assertEquals(purchase.purchase().id(),f.tx(()->f.service.confirmPurchase(f.restaurant,"confirm",body)).purchase().id());
        assertEquals(1,f.count("accounting_purchases"));assertEquals(250,purchase.purchase().totalAmount());
        assertTrue(f.service.items(f.restaurant,null,true,0,20).content().getFirst().suggestionEnabled(),"Confirmed purchase reactivates an inactive suggestion item");
        assertEquals("PURCHASED",f.service.sheet(f.restaurant,sheetId).status());
        assertEquals(1,f.service.purchases(f.restaurant,f.today,f.today,supplier.id(),"Rice","UNPAID",0,20).totalElements());
        assertEquals(250,f.service.report(f.restaurant,f.today,f.today,supplier.id(),"Rice","UNPAID").confirmedTotal());
        assertThrows(ApiException.class,()->f.tx(()->f.service.saveSheet(f.restaurant,sheetId,"posted-sheet",new SheetInput(f.today,lines,"Cannot overwrite posted plan"))));
        var payment=new PaymentInput(100L,"CASH",f.now);
        var paid=f.tx(()->f.service.payPurchase(f.restaurant,purchase.purchase().id(),"payment",payment));
        assertEquals("PARTIALLY_PAID",paid.purchase().paymentStatus());assertEquals(150,paid.purchase().outstandingAmount());
        f.tx(()->f.service.payPurchase(f.restaurant,purchase.purchase().id(),"payment",payment));assertEquals(1,f.count("accounting_purchase_payments"));
        var payable=f.service.payables(f.restaurant,0,20).content().getFirst();
        assertEquals(250,payable.confirmedObligations());assertEquals(100,payable.amountPaid());assertEquals(150,payable.outstandingAmount());
        assertEquals(f.today.plusDays(7),payable.earliestUnpaidDueDate());
        var history=f.service.supplierPayments(f.restaurant,supplier.id(),0,20);
        assertEquals(1,history.totalElements());assertEquals(100,history.content().getFirst().payment().amount());
        assertEquals(250,f.service.report(f.restaurant,f.today,f.today,supplier.id(),null,"PARTIALLY_PAID").monthlyTotals().getFirst().confirmedTotal());
        assertEquals(0,f.service.report(f.restaurant,f.today,f.today,supplier.id(),null,"UNPAID").confirmedTotal());
        assertThrows(ApiException.class,()->f.tx(()->f.service.payPurchase(f.restaurant,purchase.purchase().id(),"overpayment",new PaymentInput(151L,"CASH",f.now))));
        assertThrows(ApiException.class,()->f.tx(()->f.service.cancelPurchase(f.restaurant,purchase.purchase().id(),"premature-cancel",new ReasonInput("Must reverse payment first"))));
        var reversed=f.tx(()->f.service.reversePayment(f.restaurant,purchase.purchase().id(),paid.payments().getFirst().id(),"reverse",new ReasonInput("Wrong payment record")));
        assertEquals(0,reversed.purchase().amountPaid());assertNotNull(reversed.payments().getFirst().reversalId());
        assertNotNull(f.service.supplierPayments(f.restaurant,supplier.id(),0,20).content().getFirst().payment().reversalId());
        var cancelled=f.tx(()->f.service.cancelPurchase(f.restaurant,purchase.purchase().id(),"cancel",new ReasonInput("Duplicate invoice")));
        assertEquals("CANCELLED",cancelled.purchase().status());assertEquals(0,cancelled.purchase().outstandingAmount());
        assertEquals(0,f.service.payables(f.restaurant,0,20).content().getFirst().confirmedObligations());
        f.tx(()->f.service.saveItem(f.restaurant,item.id(),"rename",new ItemInput("Renamed rice","kg",BigDecimal.ONE,supplier.id(),true,"Catalog rename")));
        assertEquals("Rice",f.service.purchase(f.restaurant,purchase.purchase().id()).lines().getFirst().itemName());
        var replacementBody=new PurchaseInput(f.today,f.now.minusSeconds(30),supplier.id(),List.of(new LineInput(item.id(),new BigDecimal("2.5"),"kg",200L,null)),null,null,null,"INV-ONE-CORRECTED",purchase.purchase().id(),"Correct historical price");
        var replacement=f.tx(()->f.service.confirmPurchase(f.restaurant,"replacement",replacementBody));
        assertEquals(500,replacement.purchase().totalAmount());assertEquals(purchase.purchase().id(),replacement.purchase().correctionOfId());
        assertEquals(List.of(replacement.purchase().id()),f.service.purchase(f.restaurant,purchase.purchase().id()).corrections());
        var report=f.service.report(f.restaurant,f.today,f.today,supplier.id(),null);
        assertEquals(500,report.confirmedTotal());assertEquals(250,report.cancelledTotal());
        String csv=f.service.export(f.restaurant,f.today,f.today,supplier.id(),null,null);
        assertTrue(csv.contains("historical_unit_cost"));assertTrue(csv.contains("payment_history_json"));assertTrue(csv.contains("CASH"));
        assertTrue(csv.contains("Wrong payment record"));assertTrue(csv.contains("Duplicate invoice"));assertTrue(csv.contains("\"Rice\""));assertTrue(csv.contains("\"Renamed rice\""));
        assertEquals(2,f.service.purchases(f.restaurant,f.today,f.today,null,null,null,0,1).totalElements());
        assertEquals(1,f.service.purchases(f.restaurant,f.today,f.today,null,null,null,1,1).content().size());
    }

    private static final class Fixture {
        final UUID restaurant=UUID.randomUUID(),actor=UUID.randomUUID();
        final LocalDate today=LocalDate.now(ZoneId.of("Asia/Yangon"));
        final OffsetDateTime now=OffsetDateTime.now(ZoneOffset.UTC).minusSeconds(1);
        final JdbcTemplate jdbc;
        final TransactionTemplate transaction;
        final ProcurementService service;
        Fixture() {
            var source=new DriverManagerDataSource(System.getenv("ACCOUNTING_TEST_DATABASE_URL"),"postgres","");
            jdbc=new JdbcTemplate(source);transaction=new TransactionTemplate(new DataSourceTransactionManager(source));
            jdbc.update("INSERT INTO auth.users(id) VALUES(?)",actor);
            jdbc.update("INSERT INTO public.restaurants(id,name,slug,township,city) VALUES(?,'Procurement SQL integration',?,'Bahan','Yangon')",restaurant,"procurement-"+restaurant);
            jdbc.update("INSERT INTO public.restaurant_settings(restaurant_id,common_qr_token) VALUES(?,?)",restaurant,UUID.randomUUID().toString());
            var auth=mock(RestaurantAuthorization.class);when(auth.requireAuthenticatedUserId()).thenReturn(actor);
            var settings=mock(RestaurantSettingsRepository.class);var record=new RestaurantSettings();record.setRestaurantId(restaurant);record.setTimezone("Asia/Yangon");when(settings.findById(restaurant)).thenReturn(Optional.of(record));
            service=new ProcurementService(jdbc,new AccountingSupport(jdbc,auth,settings));
        }
        <T>T tx(Supplier<T> action){return transaction.execute(status->action.get());}
        long count(String table){return jdbc.queryForObject("SELECT count(*) FROM public."+table+" WHERE restaurant_id=?",Long.class,restaurant);}
    }
}
