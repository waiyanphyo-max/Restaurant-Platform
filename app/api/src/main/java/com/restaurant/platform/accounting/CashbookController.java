package com.restaurant.platform.accounting;

import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/restaurants/{restaurantId}/accounting/cashbook")
public class CashbookController {
    private final CashbookService service;
    public CashbookController(CashbookService service) {this.service=service;}
    @GetMapping("/daily")
    public CashbookDtos.Day day(@PathVariable UUID restaurantId,@RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate date) {return service.day(restaurantId,date);}
    @GetMapping("/transactions")
    public CashbookDtos.Page<CashbookDtos.Transaction> transactions(@PathVariable UUID restaurantId,
            @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required=false) String search,
            @RequestParam(defaultValue="OLDEST") AccountingSupport.Chronology sort,
            @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="50") int size) {
        return service.transactions(restaurantId,from,to,search,sort,page,size);
    }
    @GetMapping("/closings")
    public CashbookDtos.Page<CashbookDtos.Closing> closings(@PathVariable UUID restaurantId,
            @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue="NEWEST") AccountingSupport.Chronology sort,
            @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="50") int size) {
        return service.closings(restaurantId,from,to,sort,page,size);
    }
    @PostMapping("/openings")
    public CashbookDtos.Id open(@PathVariable UUID restaurantId,@RequestHeader("Idempotency-Key") String key,@Valid @RequestBody CashbookDtos.Opening r) {return new CashbookDtos.Id(service.open(restaurantId,key,r));}
    @PostMapping("/movements")
    public CashbookDtos.Id movement(@PathVariable UUID restaurantId,@RequestHeader("Idempotency-Key") String key,@Valid @RequestBody CashbookDtos.Movement r) {return new CashbookDtos.Id(service.movement(restaurantId,key,r));}
    @PostMapping("/movements/{movementId}/reverse")
    public CashbookDtos.Id reverseMovement(@PathVariable UUID restaurantId,@PathVariable UUID movementId,@RequestHeader("Idempotency-Key") String key,@Valid @RequestBody ExpenseDtos.Reason r) {return new CashbookDtos.Id(service.reverseMovement(restaurantId,movementId,key,r));}
    @PostMapping("/closings")
    public CashbookDtos.Closing close(@PathVariable UUID restaurantId,@RequestHeader("Idempotency-Key") String key,@Valid @RequestBody CashbookDtos.Close r) {return service.close(restaurantId,key,r);}
    @PostMapping("/closings/{closingId}/reverse")
    public CashbookDtos.Id reverseClosing(@PathVariable UUID restaurantId,@PathVariable UUID closingId,@RequestHeader("Idempotency-Key") String key,@Valid @RequestBody ExpenseDtos.Reason r) {return new CashbookDtos.Id(service.reverseClosing(restaurantId,closingId,key,r));}
}
