package com.restaurant.platform.accounting;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.service.ImageUploadValidator;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.AdditionalMatchers.aryEq;
import static org.mockito.Mockito.*;

class AccountingRecordServiceTest {
    private AccountingSupport support;
    private JdbcTemplate jdbc;
    private AccountingRecordService service;
    private final UUID restaurant=UUID.randomUUID(),actor=UUID.randomUUID();
    private final byte[] pdf="%PDF-1.7\nreceipt\n%%EOF".getBytes(StandardCharsets.US_ASCII);

    @BeforeEach void setUp() {
        support=mock(AccountingSupport.class);jdbc=mock(JdbcTemplate.class);
        service=new AccountingRecordService(support,jdbc,new ImageUploadValidator());
        when(support.write(restaurant)).thenReturn(actor);
    }

    @Test void rejectsMissingOversizedAndSpoofedReceiptsBeforeWriting() {
        assertEquals("RECEIPT_REQUIRED",assertThrows(ApiException.class,()->service.upload(restaurant,"missing",null)).getCode());
        assertEquals("RECEIPT_REQUIRED",assertThrows(ApiException.class,()->service.upload(restaurant,"empty",new MockMultipartFile("file",new byte[0]))).getCode());
        assertEquals(HttpStatus.PAYLOAD_TOO_LARGE,assertThrows(ApiException.class,()->service.upload(restaurant,"big",new MockMultipartFile("file","large.pdf","application/pdf",new byte[5242881]))).getStatus());
        assertEquals("INVALID_RECEIPT_CONTENT",assertThrows(ApiException.class,()->service.upload(restaurant,"spoof",new MockMultipartFile("file","receipt.pdf","application/pdf","fake PDF".getBytes(StandardCharsets.UTF_8)))).getCode());
        assertEquals(HttpStatus.UNSUPPORTED_MEDIA_TYPE,assertThrows(ApiException.class,()->service.upload(restaurant,"html",new MockMultipartFile("file","receipt.html","text/html",pdf))).getStatus());
        assertEquals("IMAGE_CONTENT_MISMATCH",assertThrows(ApiException.class,()->service.upload(restaurant,"spoof-image",new MockMultipartFile("file","receipt.png","image/png",pdf))).getCode());
        verifyNoInteractions(jdbc);
        verify(support,never()).once(any(),any(),any(),any(),any());
    }

    @Test void rejectsActualOversizedContentEvenWhenDeclaredSizeIsWrong() throws Exception {
        MultipartFile file=mock(MultipartFile.class);
        when(file.isEmpty()).thenReturn(false);when(file.getSize()).thenReturn(100L);when(file.getContentType()).thenReturn("application/pdf");
        byte[] content=new byte[5242881];System.arraycopy(pdf,0,content,0,pdf.length);when(file.getBytes()).thenReturn(content);
        assertEquals(HttpStatus.PAYLOAD_TOO_LARGE,assertThrows(ApiException.class,()->service.upload(restaurant,"bad-size",file)).getStatus());
        verifyNoInteractions(jdbc);
    }

    @Test @SuppressWarnings({"unchecked","rawtypes"})
    void uploadRecordsAuthenticatedCreatorHashAndImmutableMetadata() {
        OffsetDateTime at=OffsetDateTime.parse("2026-11-02T00:00:00Z");
        when(support.once(eq(restaurant),eq("receipt.upload"),eq("upload"),any(),any()))
            .thenAnswer(invocation->((Supplier<UUID>)invocation.getArgument(4)).get());
        doAnswer(invocation->List.of(new AccountingRecordService.Receipt(invocation.getArgument(3),"application/pdf",pdf.length,actor,at)))
            .when(jdbc).query(startsWith("SELECT id,content_type"),any(RowMapper.class),eq(restaurant),any(UUID.class));
        var saved=service.upload(restaurant,"upload",new MockMultipartFile("file","../../unsafe-name.pdf"," APPLICATION/PDF ",pdf));
        assertEquals(actor,saved.createdBy());assertEquals(at,saved.createdAt());assertEquals(pdf.length,saved.size());
        ArgumentCaptor<UUID> generated=ArgumentCaptor.forClass(UUID.class);
        verify(jdbc).update(contains("INSERT INTO public.accounting_receipts"),generated.capture(),eq(restaurant),eq("application/pdf"),aryEq(pdf),eq(AccountingSupport.sha256(pdf)),eq(actor));
        assertEquals(generated.getValue(),saved.id());
        verify(support).audit(eq(restaurant),eq(actor),eq("RECEIPT"),eq(generated.getValue()),eq("UPLOAD"),isNull(),eq(Map.of("sha256",AccountingSupport.sha256(pdf),"contentType","application/pdf")));
        verify(jdbc,never()).update(startsWith("UPDATE"),any(Object[].class));
        verify(jdbc,never()).update(startsWith("DELETE"),any(Object[].class));
    }

    @Test @SuppressWarnings({"unchecked","rawtypes"})
    void idempotentRetryPreservesOriginalCreatorAndTimestampWithoutRewriting() {
        UUID receipt=UUID.randomUUID(),originalCreator=UUID.randomUUID();
        OffsetDateTime at=OffsetDateTime.parse("2026-11-01T23:59:00Z");
        var original=new AccountingRecordService.Receipt(receipt,"application/pdf",pdf.length,originalCreator,at);
        when(support.once(eq(restaurant),eq("receipt.upload"),eq("retry"),any(),any())).thenReturn(receipt);
        doReturn(List.of(original)).when(jdbc).query(startsWith("SELECT id,content_type"),any(RowMapper.class),eq(restaurant),eq(receipt));
        assertEquals(original,service.upload(restaurant,"retry",new MockMultipartFile("file","receipt.pdf","application/pdf",pdf)));
        verify(jdbc,never()).update(anyString(),any(Object[].class));
        verify(support,never()).audit(any(),any(),any(),any(),any(),any(),any());
    }

    @Test @SuppressWarnings({"unchecked","rawtypes"})
    void receiptLookupIsTenantScopedAndForeignReferencesReturnNotFound() {
        UUID receipt=UUID.randomUUID(),foreign=UUID.randomUUID();
        var content=new AccountingRecordService.ReceiptContent("application/pdf",pdf);
        doReturn(List.of(content)).when(jdbc).query(startsWith("SELECT content_type,content"),any(RowMapper.class),eq(restaurant),eq(receipt));
        doReturn(List.of()).when(jdbc).query(startsWith("SELECT content_type,content"),any(RowMapper.class),eq(foreign),eq(receipt));
        assertArrayEquals(pdf,service.receipt(restaurant,receipt).content());
        assertEquals("RECEIPT_NOT_FOUND",assertThrows(ApiException.class,()->service.receipt(foreign,receipt)).getCode());
        verify(support).read(restaurant);verify(support).read(foreign);
    }

    @Test void permissionDenialOccursBeforeFileProcessingAndDatabaseLookup() {
        doThrow(AccountingSupport.invalid("DENIED")).when(support).write(restaurant);
        MultipartFile file=mock(MultipartFile.class);
        assertThrows(ApiException.class,()->service.upload(restaurant,"denied",file));
        verifyNoInteractions(file,jdbc);
        doThrow(AccountingSupport.missing("DENIED")).when(support).read(restaurant);
        assertThrows(ApiException.class,()->service.receipt(restaurant,UUID.randomUUID()));
        verifyNoInteractions(jdbc);
    }
}
