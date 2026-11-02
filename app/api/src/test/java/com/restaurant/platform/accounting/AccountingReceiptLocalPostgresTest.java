package com.restaurant.platform.accounting;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.repository.RestaurantSettingsRepository;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.service.ImageUploadValidator;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.transaction.support.TransactionTemplate;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Opt-in only to the same migrated disposable localhost database as the accounting integration suite. */
@EnabledIfEnvironmentVariable(named="ACCOUNTING_TEST_DATABASE_URL",matches="jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/accounting_verify")
class AccountingReceiptLocalPostgresTest {
    @Test void receiptBytesAndMetadataAreImmutableAndNeverCrossRestaurantBoundaries() {
        var source=new DriverManagerDataSource(System.getenv("ACCOUNTING_TEST_DATABASE_URL"),"postgres","");
        var jdbc=new JdbcTemplate(source);
        UUID restaurant=UUID.randomUUID(),foreign=UUID.randomUUID(),creator=UUID.randomUUID(),otherActor=UUID.randomUUID();
        jdbc.update("INSERT INTO auth.users(id) VALUES(?),(?)",creator,otherActor);
        for(UUID id:new UUID[]{restaurant,foreign})jdbc.update("INSERT INTO public.restaurants(id,name,slug,township,city) VALUES(?,'Receipt integration',?,'Bahan','Yangon')",id,"receipt-"+id);
        var auth=mock(RestaurantAuthorization.class);when(auth.requireAuthenticatedUserId()).thenReturn(creator);
        var support=new AccountingSupport(jdbc,auth,mock(RestaurantSettingsRepository.class));
        var service=new AccountingRecordService(support,jdbc,new ImageUploadValidator());
        var tx=new TransactionTemplate(new DataSourceTransactionManager(source));
        byte[] bytes="%PDF-1.7\nRecorded invoice\n%%EOF".getBytes(StandardCharsets.US_ASCII);
        var file=new MockMultipartFile("file","private-invoice.pdf","application/pdf",bytes);
        var first=tx.execute(status->service.upload(restaurant,"immutable-receipt",file));
        assertNotNull(first);assertEquals(creator,first.createdBy());assertEquals(bytes.length,first.size());
        assertArrayEquals(bytes,service.receipt(restaurant,first.id()).content());
        assertEquals("RECEIPT_NOT_FOUND",assertThrows(ApiException.class,()->service.receipt(foreign,first.id())).getCode());
        when(auth.requireAuthenticatedUserId()).thenReturn(otherActor);
        var retry=tx.execute(status->service.upload(restaurant,"immutable-receipt",file));
        assertEquals(first,retry,"An authorized retry must preserve the original receipt identity, creator and timestamp");
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM public.accounting_receipts WHERE restaurant_id=?",Integer.class,restaurant));
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM public.accounting_audit WHERE restaurant_id=? AND entity_type='RECEIPT'",Integer.class,restaurant));
        var changed=new MockMultipartFile("file","changed.pdf","application/pdf","%PDF-1.7\nChanged invoice".getBytes(StandardCharsets.US_ASCII));
        assertEquals("IDEMPOTENCY_KEY_REUSED",assertThrows(ApiException.class,()->tx.execute(status->service.upload(restaurant,"immutable-receipt",changed))).getCode());
        assertThrows(DataIntegrityViolationException.class,()->jdbc.update("UPDATE public.accounting_receipts SET created_by=? WHERE id=?",otherActor,first.id()));
        assertThrows(DataIntegrityViolationException.class,()->jdbc.update("UPDATE public.accounting_receipts SET content=? WHERE id=?",new byte[]{1},first.id()));
        assertThrows(DataIntegrityViolationException.class,()->jdbc.update("DELETE FROM public.accounting_receipts WHERE id=?",first.id()));
        assertThrows(DataIntegrityViolationException.class,()->jdbc.update("INSERT INTO public.accounting_purchases(id,restaurant_id,purchase_date,purchased_at,total_amount,receipt_id,created_by) VALUES(?,?,CURRENT_DATE,now(),1,?,?)",UUID.randomUUID(),foreign,first.id(),creator));
        assertArrayEquals(bytes,service.receipt(restaurant,first.id()).content());
    }
}
