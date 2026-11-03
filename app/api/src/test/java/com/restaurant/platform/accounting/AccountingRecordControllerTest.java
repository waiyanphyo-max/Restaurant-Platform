package com.restaurant.platform.accounting;

import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AccountingRecordControllerTest {
    @Test void receiptsAreAuthenticatedAttachmentsWithNoSharedCache() {
        UUID restaurant=UUID.randomUUID(),receipt=UUID.randomUUID();
        var service=mock(AccountingRecordService.class);
        byte[] bytes="%PDF-1.7\nreceipt".getBytes(StandardCharsets.US_ASCII);
        when(service.receipt(restaurant,receipt)).thenReturn(new AccountingRecordService.ReceiptContent("application/pdf",bytes));
        var response=new AccountingRecordController(service).receipt(restaurant,receipt);
        assertEquals("private, no-store",response.getHeaders().getFirst(HttpHeaders.CACHE_CONTROL));
        assertEquals("nosniff",response.getHeaders().getFirst("X-Content-Type-Options"));
        assertEquals("application/pdf",response.getHeaders().getFirst(HttpHeaders.CONTENT_TYPE));
        assertEquals("attachment; filename=\"receipt-"+receipt+".pdf\"",response.getHeaders().getFirst(HttpHeaders.CONTENT_DISPOSITION));
        assertArrayEquals(bytes,response.getBody());verify(service).receipt(restaurant,receipt);
    }
}
