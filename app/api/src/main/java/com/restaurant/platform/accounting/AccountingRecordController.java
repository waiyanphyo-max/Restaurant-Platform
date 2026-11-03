package com.restaurant.platform.accounting;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/restaurants/{restaurantId}/accounting")
public class AccountingRecordController {
    private final AccountingRecordService service;
    public AccountingRecordController(AccountingRecordService service) { this.service = service; }

    @PostMapping(value = "/receipts", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public AccountingRecordService.Receipt upload(@PathVariable UUID restaurantId,
            @RequestHeader("Idempotency-Key") String key, @RequestPart("file") MultipartFile file) {
        return service.upload(restaurantId, key, file);
    }

    @GetMapping("/receipts/{receiptId}")
    public ResponseEntity<byte[]> receipt(@PathVariable UUID restaurantId, @PathVariable UUID receiptId) {
        var receipt = service.receipt(restaurantId, receiptId);
        String extension = switch (receipt.contentType()) { case "application/pdf" -> "pdf"; case "image/png" -> "png"; case "image/webp" -> "webp"; default -> "jpg"; };
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(receipt.contentType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"receipt-" + receiptId + "." + extension + "\"")
                .header(HttpHeaders.CACHE_CONTROL, "private, no-store")
                .header("X-Content-Type-Options", "nosniff").body(receipt.content());
    }

    @GetMapping("/audit")
    public AccountingRecordService.AuditPage audit(@PathVariable UUID restaurantId,
            @RequestParam(required = false) UUID entityId, @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "NEWEST") AccountingSupport.Chronology sort,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "50") int size) {
        return service.audit(restaurantId, entityId, search, sort, page, size);
    }
}
