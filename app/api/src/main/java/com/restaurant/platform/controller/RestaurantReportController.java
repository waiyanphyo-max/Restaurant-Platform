package com.restaurant.platform.controller;

import com.restaurant.platform.dto.report.DailyOperationsReportResponse;
import com.restaurant.platform.service.RestaurantReportService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/restaurants/{restaurantId}/reports")
@RequiredArgsConstructor
public class RestaurantReportController {

    private final RestaurantReportService reportService;

    @GetMapping("/daily")
    public DailyOperationsReportResponse getDailyReport(
            @PathVariable UUID restaurantId,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return reportService.getDailyReport(restaurantId, date);
    }
}
