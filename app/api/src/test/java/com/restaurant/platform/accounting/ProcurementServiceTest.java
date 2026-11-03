package com.restaurant.platform.accounting;

import static com.restaurant.platform.accounting.ProcurementDtos.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.restaurant.platform.common.error.ApiException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import java.util.function.Supplier;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

class ProcurementServiceTest {
    @Test
    void seventhRestaurantCalendarDayExpiresButSixthStillSuggests() {
        LocalDate purchase=LocalDate.of(2026,10,27);
        assertTrue(ProcurementService.eligible(purchase,purchase,true));
        assertTrue(ProcurementService.eligible(purchase.plusDays(6),purchase,true));
        assertFalse(ProcurementService.eligible(purchase.plusDays(7),purchase,true));
        assertFalse(ProcurementService.eligible(purchase.minusDays(1),purchase,true));
        assertFalse(ProcurementService.eligible(purchase,null,true));
        assertFalse(ProcurementService.eligible(purchase,purchase,false));
    }

    @Test
    void decimalQuantitiesNeverUseFloatingPointOrSilentlyRoundWholeCurrency() {
        assertEquals(300,ProcurementService.lineTotal(new BigDecimal("0.3"),1000));
        assertEquals(9007199254740993L,ProcurementService.lineTotal(BigDecimal.ONE,9007199254740993L));
        assertEquals(Long.MAX_VALUE,ProcurementService.lineTotal(BigDecimal.ONE,Long.MAX_VALUE));
        assertThrows(ApiException.class,()->ProcurementService.lineTotal(new BigDecimal("0.3"),1));
        assertThrows(ApiException.class,()->ProcurementService.lineTotal(new BigDecimal("2"),Long.MAX_VALUE));
        assertThrows(ApiException.class,()->ProcurementService.lineTotal(new BigDecimal("0.0000001"),10000000));
        assertThrows(ApiException.class,()->ProcurementService.lineTotal(BigDecimal.ZERO,100));
        assertThrows(ApiException.class,()->ProcurementService.lineTotal(BigDecimal.ONE,-1));
    }

    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void savingPlanWritesOnlyPlanAndAuditWithoutPostingPurchaseOrPayment() {
        JdbcTemplate jdbc=mock(JdbcTemplate.class);
        AccountingSupport support=mock(AccountingSupport.class);
        ProcurementService service=new ProcurementService(jdbc,support);
        UUID restaurant=UUID.randomUUID(),actor=UUID.randomUUID(),itemId=UUID.randomUUID();
        Item item=new Item(itemId,"Historical rice","kg",BigDecimal.ONE,null,true,null,null,null,false,actor,null,actor,null);
        when(support.write(restaurant)).thenReturn(actor);
        when(support.once(eq(restaurant),eq("shopping-sheet:null"),eq("plan-1"),any(),any()))
                .thenAnswer(invocation->((Supplier<UUID>)invocation.getArgument(4)).get());
        doReturn(List.of(item)).when(jdbc).query(contains("SELECT * FROM public.accounting_shopping_items"),any(RowMapper.class),eq(restaurant),eq(itemId));
        Sheet result=new Sheet(UUID.randomUUID(),LocalDate.of(2026,11,2),"PLANNED","UNPURCHASED",null,List.of(),actor,null,actor,null);
        doReturn(List.of(result)).when(jdbc).query(contains("SELECT s.*"),any(RowMapper.class),eq(restaurant),any(UUID.class));
        Sheet saved=service.saveSheet(restaurant,null,"plan-1",new SheetInput(result.shoppingDate(),List.of(new LineInput(itemId,new BigDecimal("2.5"),"kg",1000L,null)),null));
        assertEquals("PLANNED",saved.status());
        verify(jdbc).update(startsWith("INSERT INTO public.accounting_shopping_sheets"),any(),eq(restaurant),eq(result.shoppingDate()),eq(actor),eq(actor));
        verify(jdbc).update(startsWith("INSERT INTO public.accounting_shopping_lines"),any(),eq(restaurant),any(),eq(itemId),eq("Historical rice"),eq(new BigDecimal("2.5")),eq("kg"),eq(1000L),eq(2500L),isNull());
        verify(jdbc,never()).update(startsWith("INSERT INTO public.accounting_purchases"),any(Object[].class));
        verify(jdbc,never()).update(startsWith("INSERT INTO public.accounting_purchase_payments"),any(Object[].class));
        verify(support).audit(eq(restaurant),eq(actor),eq("SHOPPING_SHEET"),any(UUID.class),eq("CREATE_PLAN"),isNull(),any());
    }
}
