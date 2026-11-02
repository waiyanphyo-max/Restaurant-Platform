package com.restaurant.platform.accounting;

import static com.restaurant.platform.accounting.SalesDtos.*;
import jakarta.validation.Valid;
import java.time.*;
import java.util.UUID;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/restaurants/{restaurantId}/accounting/sales")
public class SalesAccountingController {
    private final SalesAccountingService service;
    private final AccountingSupport support;
    public SalesAccountingController(SalesAccountingService service,AccountingSupport support) {
        this.service=service; this.support=support;
    }
    @GetMapping("/dashboard")
    public Dashboard dashboard(@PathVariable UUID restaurantId,
            @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam(required=false) @DateTimeFormat(pattern="yyyy-MM") YearMonth month,
            @RequestParam(required=false) Integer year) {
        return service.dashboard(restaurantId,date,month,year);
    }
    @GetMapping("/ledger")
    public LedgerPage<LedgerOrder> ledger(@PathVariable UUID restaurantId,
            @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam(required=false) @DateTimeFormat(pattern="yyyy-MM") YearMonth month,
            @RequestParam(required=false) String product,@RequestParam(required=false) String order,
            @RequestParam(required=false) String paymentStatus,@RequestParam(required=false) String channel,
            @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) {
        LocalDate[] range=period(restaurantId,from,to,date,month);
        return service.ledger(restaurantId,range[0],range[1],product,order,paymentStatus,channel,page,size);
    }
    @GetMapping("/ledger/{orderId}")
    public LedgerOrder detail(@PathVariable UUID restaurantId,@PathVariable UUID orderId) { return service.detail(restaurantId,orderId); }
    @GetMapping("/products")
    public LedgerPage<Product> products(@PathVariable UUID restaurantId,
            @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam(required=false) @DateTimeFormat(pattern="yyyy-MM") YearMonth month,
            @RequestParam(required=false) String search,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) {
        LocalDate[] range=period(restaurantId,from,to,date,month);
        return service.products(restaurantId,range[0],range[1],search,page,size);
    }
    @GetMapping(value="/ledger.csv",produces="text/csv")
    public ResponseEntity<String> csv(@PathVariable UUID restaurantId,
            @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam(required=false) @DateTimeFormat(pattern="yyyy-MM") YearMonth month,
            @RequestParam(required=false) String product,@RequestParam(required=false) String order,
            @RequestParam(required=false) String paymentStatus,@RequestParam(required=false) String channel) {
        LocalDate[] range=period(restaurantId,from,to,date,month);
        return ResponseEntity.ok().contentType(new MediaType("text","csv",java.nio.charset.StandardCharsets.UTF_8))
            .header(HttpHeaders.CONTENT_DISPOSITION,"attachment; filename=\"sales-ledger.csv\"")
            .header(HttpHeaders.CACHE_CONTROL,"no-store")
            .body(service.csvExport(restaurantId,range[0],range[1],product,order,paymentStatus,channel));
    }
    @PostMapping("/ledger/{orderId}/refunds")
    public Refund refund(@PathVariable UUID restaurantId,@PathVariable UUID orderId,
            @RequestHeader("Idempotency-Key") String key,@Valid @RequestBody RefundRequest request) {
        return service.refund(restaurantId,orderId,key,request);
    }
    private LocalDate[] period(UUID restaurantId,LocalDate from,LocalDate to,LocalDate date,YearMonth month) {
        support.read(restaurantId);
        if((from!=null||to!=null) && (date!=null||month!=null) || date!=null&&month!=null)
            throw AccountingSupport.invalid("AMBIGUOUS_SALES_PERIOD");
        if(month!=null) return new LocalDate[]{month.atDay(1),month.atEndOfMonth()};
        if(date!=null) return new LocalDate[]{date,date};
        if(from==null&&to==null) { LocalDate today=support.today(restaurantId); return new LocalDate[]{today,today}; }
        if(from==null||to==null) throw AccountingSupport.invalid("INCOMPLETE_SALES_PERIOD");
        return new LocalDate[]{from,to};
    }
    @PostMapping("/ledger/{orderId}/refunds/{refundId}/reverse")
    public RefundReversal reverseRefund(@PathVariable UUID restaurantId,@PathVariable UUID orderId,@PathVariable UUID refundId,
            @RequestHeader("Idempotency-Key") String key,@Valid @RequestBody ReversalRequest request) {
        return service.reverseRefund(restaurantId,orderId,refundId,key,request);
    }
}
