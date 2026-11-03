package com.restaurant.platform.accounting;

import com.restaurant.platform.service.ImageUploadValidator;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.web.multipart.MultipartFile;
import com.restaurant.platform.common.error.ApiException;

import java.io.IOException;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.Locale;

@Service
public class AccountingRecordService {
    private final AccountingSupport support;
    private final JdbcTemplate jdbc;
    private final ImageUploadValidator images;
    public AccountingRecordService(AccountingSupport support, JdbcTemplate jdbc, ImageUploadValidator images) {
        this.support = support; this.jdbc = jdbc; this.images = images;
    }

    @Transactional
    public Receipt upload(UUID restaurantId, String key, MultipartFile file) {
        UUID actor = support.write(restaurantId);
        if (file == null || file.isEmpty()) throw AccountingSupport.invalid("RECEIPT_REQUIRED");
        if (file.getSize() > 5L * 1024 * 1024) throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "RECEIPT_TOO_LARGE", "error.media.file-too-large");
        String type = file.getContentType() == null ? "" : file.getContentType().strip().toLowerCase(Locale.ROOT);
        byte[] bytes;
        if ("application/pdf".equals(type)) {
            try { bytes = file.getBytes(); } catch (IOException e) { throw AccountingSupport.invalid("RECEIPT_UNREADABLE"); }
            if (bytes.length < 5 || bytes[0] != '%' || bytes[1] != 'P' || bytes[2] != 'D' || bytes[3] != 'F' || bytes[4] != '-') throw AccountingSupport.invalid("INVALID_RECEIPT_CONTENT");
        } else {
            var image = images.validate(file, 5L * 1024 * 1024);
            type = image.contentType(); bytes = image.bytes();
        }
        // Verify the bytes too; a MultipartFile implementation must not bypass the storage bound by misreporting its size.
        if (bytes.length > 5L * 1024 * 1024) throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "RECEIPT_TOO_LARGE", "error.media.file-too-large");
        final String contentType = type;
        String hash = AccountingSupport.sha256(bytes);
        UUID id = support.once(restaurantId, "receipt.upload", key, Map.of("sha256", hash, "contentType", contentType), () -> {
            UUID receiptId = UUID.randomUUID();
            jdbc.update("""
                    INSERT INTO public.accounting_receipts(id,restaurant_id,content_type,content,sha256,created_by)
                    VALUES (?,?,?,?,?,?)
                    """, receiptId, restaurantId, contentType, bytes, hash, actor);
            support.audit(restaurantId, actor, "RECEIPT", receiptId, "UPLOAD", null, Map.of("sha256", hash, "contentType", contentType));
            return receiptId;
        });
        return jdbc.query("SELECT id,content_type,octet_length(content),created_by,created_at FROM public.accounting_receipts WHERE restaurant_id=? AND id=?",
                (rs, n) -> new Receipt(rs.getObject(1, UUID.class), rs.getString(2), rs.getLong(3), rs.getObject(4, UUID.class), rs.getObject(5, OffsetDateTime.class)), restaurantId, id).getFirst();
    }

    @Transactional(readOnly = true)
    public ReceiptContent receipt(UUID restaurantId, UUID receiptId) {
        support.read(restaurantId);
        return jdbc.query("SELECT content_type,content FROM public.accounting_receipts WHERE restaurant_id=? AND id=?",
                (rs, n) -> new ReceiptContent(rs.getString(1), rs.getBytes(2)), restaurantId, receiptId)
                .stream().findFirst().orElseThrow(() -> AccountingSupport.missing("RECEIPT_NOT_FOUND"));
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public AuditPage audit(UUID restaurantId, UUID entityId, String search, AccountingSupport.Chronology sort, int page, int size) {
        support.read(restaurantId); AccountingSupport.page(page, size);
        String filter = " FROM public.accounting_audit WHERE restaurant_id=?";
        var args = new ArrayList<Object>(List.of(restaurantId));
        if (entityId != null) {
            filter += " AND entity_id=?";
            args.add(entityId);
        }
        if (search != null && !search.isBlank()) {
            if (search.length() > 200) throw AccountingSupport.invalid("INVALID_ACCOUNTING_AUDIT_SEARCH");
            filter += """
                 AND (strpos(lower(replace(entity_type,'_',' ')),lower(replace(?,'_',' ')))>0
                   OR strpos(lower(action),lower(?))>0 OR strpos(lower(reason),lower(?))>0
                   OR strpos(entity_id::text,lower(?))>0 OR strpos(actor_id::text,lower(?))>0)
                """;
            args.addAll(List.of(search,search,search,search,search));
        }
        Long total = jdbc.queryForObject("SELECT count(*)" + filter, Long.class, args.toArray());
        args.add(size);
        args.add((long) page * size);
        String order = " ORDER BY created_at " + sort.direction() + ",id " + sort.direction() + " LIMIT ? OFFSET ?";
        List<AuditEntry> entries = jdbc.query("""
                SELECT id,actor_id,entity_type,entity_id,action,reason,detail::text,created_at
                """ + filter + order, (rs, n) -> new AuditEntry(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class), rs.getString(3), rs.getObject(4, UUID.class),
                rs.getString(5), rs.getString(6), rs.getString(7), rs.getObject(8, OffsetDateTime.class)), args.toArray());
        return new AuditPage(entries, total == null ? 0 : total, page, size);
    }
    public record Receipt(UUID id, String contentType, long size, UUID createdBy, OffsetDateTime createdAt) { }
    public record ReceiptContent(String contentType, byte[] content) { }
    public record AuditEntry(UUID id, UUID actorId, String entityType, UUID entityId, String action, String reason, String detailJson, OffsetDateTime createdAt) { }
    public record AuditPage(List<AuditEntry> content, long totalElements, int page, int size) { }
}
