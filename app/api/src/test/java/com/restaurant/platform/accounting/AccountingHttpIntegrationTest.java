package com.restaurant.platform.accounting;

import com.restaurant.platform.common.error.*;
import com.restaurant.platform.config.*;
import com.restaurant.platform.entity.RestaurantMember;
import com.restaurant.platform.repository.*;
import com.restaurant.platform.security.*;
import com.restaurant.platform.service.ImageUploadValidator;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(controllers={ExpenseController.class,AccountingRecordController.class,SalesAccountingController.class,
        ProcurementController.class,CashbookController.class,FinancialReportController.class},properties={
        "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://auth.example.test/auth/v1",
        "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=https://auth.example.test/auth/v1/.well-known/jwks.json"})
@Import({SecurityConfig.class,ExactNumberConfiguration.class,ApiSecurityErrorHandler.class,GlobalExceptionHandler.class,
        LocaleConfig.class,RestaurantAuthorization.class,AccountingSupport.class,ExpenseService.class,AccountingRecordService.class,
        SalesAccountingService.class,ProcurementService.class,CashbookService.class,FinancialReportService.class,ImageUploadValidator.class})
class AccountingHttpIntegrationTest {
    static final UUID RESTAURANT=UUID.randomUUID(), ACTOR=UUID.randomUUID();
    static final String BASE="/api/v1/restaurants/"+RESTAURANT+"/accounting";
    @Autowired MockMvc mvc;
    @MockitoBean JwtDecoder decoder;
    @MockitoBean RestaurantMemberRepository members;
    @MockitoBean DeliveryRepository deliveries;
    @MockitoBean OrderRepository orders;
    @MockitoBean RestaurantSettingsRepository settings;
    @MockitoBean JdbcTemplate jdbc;
    @MockitoBean NamedParameterJdbcTemplate named;

    void member(RestaurantRole role) {
        var record=new RestaurantMember();record.setRestaurantId(RESTAURANT);record.setUserId(ACTOR);record.setRole(role);
        when(members.findByRestaurantIdAndUserId(RESTAURANT,ACTOR)).thenReturn(Optional.of(record));
    }
    @Test void allFinancialFamiliesRejectAnonymousAndOperationalRoles() throws Exception {
        var paths=List.of("/sales/dashboard","/sales/ledger","/shopping/items","/purchases","/suppliers","/expenses","/cashbook/daily","/audit","/receipts/"+UUID.randomUUID(),"/reports/summary");
        for(String path:paths)mvc.perform(get(BASE+path)).andExpect(status().isUnauthorized());
        for(var role:List.of(RestaurantRole.STAFF,RestaurantRole.DELIVERY_DRIVER)) {
            member(role);
            for(String path:paths)mvc.perform(get(BASE+path).with(jwt().jwt(token->token.subject(ACTOR.toString())))).andExpect(status().isForbidden());
        }
        verifyNoInteractions(jdbc,named,settings);
    }
    @Test void claimsCannotGrantFinanceOrCrossRestaurantReceiptAccess() throws Exception {
        var forged=jwt().jwt(token->token.subject(ACTOR.toString()).claim("role","OWNER"));
        mvc.perform(get(BASE+"/receipts/"+UUID.randomUUID()).with(forged)).andExpect(status().isForbidden());
        member(RestaurantRole.OWNER);
        mvc.perform(get("/api/v1/restaurants/"+UUID.randomUUID()+"/accounting/receipts/"+UUID.randomUUID()).with(forged)).andExpect(status().isForbidden());
        verifyNoInteractions(jdbc,named);
    }
    @Test void ownerAndManagerReachScopedReceiptLookup() throws Exception {
        for(var role:List.of(RestaurantRole.OWNER,RestaurantRole.MANAGER)) {
            member(role);
            mvc.perform(get(BASE+"/receipts/"+UUID.randomUUID()).with(jwt().jwt(token->token.subject(ACTOR.toString())))).andExpect(status().isNotFound());
        }
    }
    @Test void expenseCorrectionRequiresFinancialManageOnTheRequestedRestaurant() throws Exception {
        String path = "/expenses/" + UUID.randomUUID() + "/correct";
        String body = """
                {"replacement":{"category":"WATER","amount":"100","expenseDate":"2026-01-01","description":"Water"},
                "reason":"Correct category"}
                """;
        for (var role : List.of(RestaurantRole.STAFF, RestaurantRole.DELIVERY_DRIVER)) {
            member(role);
            mvc.perform(post(BASE + path).with(jwt().jwt(token -> token.subject(ACTOR.toString())))
                    .header("Idempotency-Key", "correction").contentType("application/json").content(body))
                    .andExpect(status().isForbidden());
        }
        member(RestaurantRole.OWNER);
        mvc.perform(post("/api/v1/restaurants/" + UUID.randomUUID() + "/accounting" + path)
                .with(jwt().jwt(token -> token.subject(ACTOR.toString())))
                .header("Idempotency-Key", "correction").contentType("application/json").content(body))
                .andExpect(status().isForbidden());
        verifyNoInteractions(jdbc, named, settings);
        for (var role : List.of(RestaurantRole.OWNER, RestaurantRole.MANAGER)) {
            member(role);
            mvc.perform(post(BASE + path).with(jwt().jwt(token -> token.subject(ACTOR.toString())))
                    .header("Idempotency-Key", "invalid key").contentType("application/json").content(body))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("IDEMPOTENCY_KEY_REQUIRED"));
        }
    }
    @Test void exportsAndPostingsUseBackendPermissionsAndStayPrivate() throws Exception {
        var subject=jwt().jwt(token->token.subject(ACTOR.toString()).claim("role","OWNER"));
        var order=UUID.randomUUID();
        var refund="{\"paymentId\":\""+UUID.randomUUID()+"\",\"amount\":\"100\","
                +"\"refundedAt\":\"2026-01-01T08:30:00Z\",\"reason\":\"Record a refund\"}";
        for(var role:List.of(RestaurantRole.STAFF,RestaurantRole.DELIVERY_DRIVER)) {
            member(role);
            for (var path : List.of("/sales/ledger.csv", "/purchases/export.csv", "/reports/summary.csv")) {
                mvc.perform(get(BASE+path).with(subject).accept("text/csv")).andExpect(status().isForbidden())
                        .andExpect(header().string("Cache-Control",org.hamcrest.Matchers.containsString("no-store")))
                        .andExpect(content().contentTypeCompatibleWith("application/json"))
                        .andExpect(jsonPath("$.code").value("INSUFFICIENT_RESTAURANT_PERMISSION"));
            }
            mvc.perform(post(BASE+"/sales/ledger/"+order+"/refunds").with(subject)
                    .header("Idempotency-Key","refund").contentType("application/json").content(refund))
                    .andExpect(status().isForbidden());
        }
        var otherTenant=BASE.replace(RESTAURANT.toString(),UUID.randomUUID().toString());
        for (var role : List.of(RestaurantRole.OWNER, RestaurantRole.MANAGER)) {
            member(role);
            mvc.perform(get(otherTenant+"/sales/ledger.csv").with(subject)).andExpect(status().isForbidden());
            mvc.perform(post(otherTenant+"/sales/ledger/"+order+"/refunds").with(subject)
                    .header("Idempotency-Key","refund").contentType("application/json").content(refund))
                    .andExpect(status().isForbidden());
        }
        verifyNoInteractions(jdbc,named,settings);
    }
    @Test void serverRejectsFractionalWholeCurrencyAndInvalidQuantitiesBeforePosting() throws Exception {
        member(RestaurantRole.OWNER);
        mvc.perform(post(BASE+"/expenses").with(jwt().jwt(token->token.subject(ACTOR.toString())))
                .header("Idempotency-Key","fraction").contentType("application/json")
                .content("{\"category\":\"RENT\",\"amount\":1.5,\"expenseDate\":\"2026-01-01\",\"description\":\"Rent\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_REQUEST_BODY"));
        mvc.perform(post(BASE+"/shopping/sheets").with(jwt().jwt(token->token.subject(ACTOR.toString())))
                .header("Idempotency-Key","quantity").contentType("application/json")
                .content("{\"shoppingDate\":\"2026-01-01\",\"lines\":[{\"itemId\":\""+UUID.randomUUID()+"\",\"quantity\":\"0\",\"unit\":\"kg\",\"unitCost\":\"100\"}]}"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(jdbc,named);
    }
    @Test void sortValuesAreBoundToTheAccountingEndpointAllowLists() throws Exception {
        member(RestaurantRole.MANAGER);
        for (String path : List.of("/sales/ledger?sort=NAME", "/sales/products?sort=NEWEST", "/sales/ledger.csv?sort=UNSUPPORTED")) {
            mvc.perform(get(BASE+path).with(jwt().jwt(token->token.subject(ACTOR.toString()))))
                    .andExpect(status().isBadRequest());
        }
        verifyNoInteractions(jdbc,named,settings);
    }
    @Test void malformedDatesEnumsIdsAndMissingRequestKeysAreClientErrors() throws Exception {
        member(RestaurantRole.OWNER);
        for(String path:List.of("/sales/ledger?date=2026-02-31", "/sales/dashboard?month=2026-13",
                "/expenses?category=INVENTORY_PURCHASE", "/receipts/not-a-uuid")) {
            mvc.perform(get(BASE+path).with(jwt().jwt(token->token.subject(ACTOR.toString()))))
                    .andExpect(status().isBadRequest());
        }
        mvc.perform(post(BASE+"/expenses").with(jwt().jwt(token->token.subject(ACTOR.toString())))
                .contentType("application/json")
                .content("{\"category\":\"RENT\",\"amount\":\"100\",\"expenseDate\":\"2026-01-01\",\"description\":\"Rent\"}"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(jdbc,named);
    }
}
