package com.restaurant.platform.accounting;

import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;
import java.util.*;

@RestController
@RequestMapping("/api/v1/restaurants/{restaurantId}/accounting")
public class ExpenseController {
    private final ExpenseService service;
    public ExpenseController(ExpenseService service) {this.service=service;}
    @GetMapping("/expenses")
    public ExpenseDtos.Page<ExpenseDtos.Expense> list(@PathVariable UUID restaurantId,
            @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required=false) ExpenseDtos.Category category,@RequestParam(required=false) String search,
            @RequestParam(required=false) String paymentStatus,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="50") int size) {
        return service.list(restaurantId,from,to,category,search,paymentStatus,page,size);
    }
    @GetMapping("/expenses/{expenseId}")
    public ExpenseDtos.Detail detail(@PathVariable UUID restaurantId,@PathVariable UUID expenseId) {return service.detail(restaurantId,expenseId);}
    @PostMapping("/expenses")
    public ExpenseDtos.Expense create(@PathVariable UUID restaurantId,@RequestHeader("Idempotency-Key") String key,@Valid @RequestBody ExpenseDtos.Create r) {return service.create(restaurantId,key,r);}
    @PostMapping("/expenses/{expenseId}/payments")
    public ExpenseDtos.Detail pay(@PathVariable UUID restaurantId,@PathVariable UUID expenseId,@RequestHeader("Idempotency-Key") String key,@Valid @RequestBody ExpenseDtos.Pay r) {return service.pay(restaurantId,expenseId,key,r);}
    @PostMapping("/expenses/{expenseId}/payments/{paymentId}/reverse")
    public ExpenseDtos.Detail reversePayment(@PathVariable UUID restaurantId,@PathVariable UUID expenseId,@PathVariable UUID paymentId,@RequestHeader("Idempotency-Key") String key,@Valid @RequestBody ExpenseDtos.Reason r) {return service.reversePayment(restaurantId,expenseId,paymentId,key,r);}
    @PostMapping("/expenses/{expenseId}/cancel")
    public ExpenseDtos.Expense cancel(@PathVariable UUID restaurantId,@PathVariable UUID expenseId,@RequestHeader("Idempotency-Key") String key,@Valid @RequestBody ExpenseDtos.Reason r) {return service.cancel(restaurantId,expenseId,key,r);}
    @GetMapping("/expenses/report")
    public ExpenseDtos.Report report(@PathVariable UUID restaurantId,
            @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue="DAY") ExpenseDtos.Period period) {return service.report(restaurantId,from,to,period);}
    @GetMapping("/expense-templates")
    public List<ExpenseDtos.Template> templates(@PathVariable UUID restaurantId) {return service.templates(restaurantId);}
    @PostMapping("/expense-templates")
    public CashbookDtos.Id createTemplate(@PathVariable UUID restaurantId,@RequestHeader("Idempotency-Key") String key,@Valid @RequestBody ExpenseDtos.CreateTemplate r) {return new CashbookDtos.Id(service.createTemplate(restaurantId,key,r));}
    @PostMapping("/expense-templates/{templateId}/confirm")
    public ExpenseDtos.Expense confirmTemplate(@PathVariable UUID restaurantId,@PathVariable UUID templateId,@RequestHeader("Idempotency-Key") String key,@Valid @RequestBody ExpenseDtos.Confirm r) {return service.confirmTemplate(restaurantId,templateId,key,r);}
    @PostMapping("/expense-templates/{templateId}/stop")
    public CashbookDtos.Id stopTemplate(@PathVariable UUID restaurantId,@PathVariable UUID templateId,@RequestHeader("Idempotency-Key") String key,@Valid @RequestBody ExpenseDtos.Reason r) {return new CashbookDtos.Id(service.stopTemplate(restaurantId,templateId,key,r));}
}
