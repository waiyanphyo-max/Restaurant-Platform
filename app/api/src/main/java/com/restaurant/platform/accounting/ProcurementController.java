package com.restaurant.platform.accounting;

import static com.restaurant.platform.accounting.ProcurementDtos.*;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/restaurants/{restaurantId}/accounting")
@RequiredArgsConstructor
public class ProcurementController {
    private final ProcurementService service;

    @GetMapping("/suppliers")
    public Page<Supplier> suppliers(@PathVariable UUID restaurantId,@RequestParam(required=false) String search,
                                    @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="50") int size) {
        return service.suppliers(restaurantId,search,page,size);
    }
    @PostMapping("/suppliers")
    public Supplier createSupplier(@PathVariable UUID restaurantId,@RequestHeader("Idempotency-Key") String key,@Valid @RequestBody SupplierInput input) {
        return service.saveSupplier(restaurantId,null,key,input);
    }
    @PutMapping("/suppliers/{id}")
    public Supplier updateSupplier(@PathVariable UUID restaurantId,@PathVariable UUID id,@RequestHeader("Idempotency-Key") String key,@Valid @RequestBody SupplierInput input) {
        return service.saveSupplier(restaurantId,id,key,input);
    }
    @GetMapping("/shopping/items")
    public Page<Item> items(@PathVariable UUID restaurantId,@RequestParam(required=false) String search,
                            @RequestParam(defaultValue="false") boolean suggestionsOnly,
                            @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="50") int size) {
        return service.items(restaurantId,search,suggestionsOnly,page,size);
    }
    @PostMapping("/shopping/items")
    public Item createItem(@PathVariable UUID restaurantId,@RequestHeader("Idempotency-Key") String key,@Valid @RequestBody ItemInput input) {
        return service.saveItem(restaurantId,null,key,input);
    }
    @PutMapping("/shopping/items/{id}")
    public Item updateItem(@PathVariable UUID restaurantId,@PathVariable UUID id,@RequestHeader("Idempotency-Key") String key,@Valid @RequestBody ItemInput input) {
        return service.saveItem(restaurantId,id,key,input);
    }
    @GetMapping("/shopping/sheets")
    public Page<Sheet> sheets(@PathVariable UUID restaurantId,
                              @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate from,
                              @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate to,
                              @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="50") int size) {
        return service.sheets(restaurantId,from,to,page,size);
    }
    @GetMapping("/shopping/sheets/{id}")
    public Sheet sheet(@PathVariable UUID restaurantId,@PathVariable UUID id) {return service.sheet(restaurantId,id);}
    @PostMapping("/shopping/sheets")
    public Sheet createSheet(@PathVariable UUID restaurantId,@RequestHeader("Idempotency-Key") String key,@Valid @RequestBody SheetInput input) {
        return service.saveSheet(restaurantId,null,key,input);
    }
    @PutMapping("/shopping/sheets/{id}")
    public Sheet updateSheet(@PathVariable UUID restaurantId,@PathVariable UUID id,@RequestHeader("Idempotency-Key") String key,@Valid @RequestBody SheetInput input) {
        return service.saveSheet(restaurantId,id,key,input);
    }
    @GetMapping("/purchases")
    public Page<PurchaseSummary> purchases(@PathVariable UUID restaurantId,
                                           @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate from,
                                           @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate to,
                                           @RequestParam(required=false) UUID supplierId,@RequestParam(required=false) String item,
                                           @RequestParam(required=false) String paymentStatus,
                                           @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="50") int size) {
        return service.purchases(restaurantId,from,to,supplierId,item,paymentStatus,page,size);
    }
    @GetMapping("/purchases/{id}")
    public PurchaseDetail purchase(@PathVariable UUID restaurantId,@PathVariable UUID id) {return service.purchase(restaurantId,id);}
    @PostMapping("/purchases")
    public PurchaseDetail confirmPurchase(@PathVariable UUID restaurantId,@RequestHeader("Idempotency-Key") String key,@Valid @RequestBody PurchaseInput input) {
        return service.confirmPurchase(restaurantId,key,input);
    }
    @PostMapping("/purchases/{id}/cancel")
    public PurchaseDetail cancelPurchase(@PathVariable UUID restaurantId,@PathVariable UUID id,@RequestHeader("Idempotency-Key") String key,@Valid @RequestBody ReasonInput input) {
        return service.cancelPurchase(restaurantId,id,key,input);
    }
    @PostMapping("/purchases/{id}/payments")
    public PurchaseDetail payPurchase(@PathVariable UUID restaurantId,@PathVariable UUID id,@RequestHeader("Idempotency-Key") String key,@Valid @RequestBody PaymentInput input) {
        return service.payPurchase(restaurantId,id,key,input);
    }
    @PostMapping("/purchases/{id}/payments/{paymentId}/reverse")
    public PurchaseDetail reversePayment(@PathVariable UUID restaurantId,@PathVariable UUID id,@PathVariable UUID paymentId,@RequestHeader("Idempotency-Key") String key,@Valid @RequestBody ReasonInput input) {
        return service.reversePayment(restaurantId,id,paymentId,key,input);
    }
    @GetMapping("/purchases/report")
    public PurchaseReport report(@PathVariable UUID restaurantId,
                                  @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate from,
                                  @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate to,
                                  @RequestParam(required=false) UUID supplierId,@RequestParam(required=false) String item,
                                  @RequestParam(required=false) String paymentStatus) {
        return service.report(restaurantId,from,to,supplierId,item,paymentStatus);
    }
    @GetMapping("/purchases/export.csv")
    public ResponseEntity<String> export(@PathVariable UUID restaurantId,
                                          @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate from,
                                          @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate to,
                                          @RequestParam(required=false) UUID supplierId,@RequestParam(required=false) String item,
                                          @RequestParam(required=false) String paymentStatus) {
        return ResponseEntity.ok().contentType(MediaType.parseMediaType("text/csv;charset=UTF-8"))
                .header(HttpHeaders.CONTENT_DISPOSITION,"attachment; filename=\"purchase-history.csv\"")
                .body(service.export(restaurantId,from,to,supplierId,item,paymentStatus));
    }
    @GetMapping("/suppliers/payables")
    public Page<Payable> payables(@PathVariable UUID restaurantId,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="50") int size) {
        return service.payables(restaurantId,page,size);
    }
    @GetMapping("/suppliers/{id}/payments")
    public Page<SupplierPayment> supplierPayments(@PathVariable UUID restaurantId,@PathVariable UUID id,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="50") int size) {
        return service.supplierPayments(restaurantId,id,page,size);
    }
}
