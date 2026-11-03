package com.restaurant.platform.accounting;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/restaurants/{restaurantId}/accounting/reports")
public class FinancialReportController {
    private final FinancialReportService service;
    public FinancialReportController(FinancialReportService service) { this.service = service; }
    @GetMapping("/summary")
    public FinancialReportService.Report report(@PathVariable UUID restaurantId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return service.report(restaurantId, from, to);
    }

    @GetMapping(value = "/summary.csv", produces = "text/csv")
    public ResponseEntity<String> export(@PathVariable UUID restaurantId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"financial-summary.csv\"")
                .body(service.export(restaurantId, from, to));
    }
}
