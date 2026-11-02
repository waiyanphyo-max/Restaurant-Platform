package com.restaurant.platform.accounting;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;
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
}
