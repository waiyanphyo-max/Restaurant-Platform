package com.restaurant.platform.controller;

import com.restaurant.platform.common.error.ApiSecurityErrorHandler;
import com.restaurant.platform.config.LocaleConfig;
import com.restaurant.platform.config.SecurityConfig;
import com.restaurant.platform.dto.order.CreateOrderResponse;
import com.restaurant.platform.dto.order.CustomerDeliveryCheckoutRequest;
import com.restaurant.platform.dto.order.CustomerDeliveryQuote;
import com.restaurant.platform.repository.DeliveryRepository;
import com.restaurant.platform.repository.RestaurantMemberRepository;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.service.CustomerDeliveryCheckoutService;
import com.restaurant.platform.service.OrderService;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(controllers = CustomerOrderController.class, properties = {
        "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://auth.example.test/auth/v1",
        "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=https://auth.example.test/auth/v1/.well-known/jwks.json"
})
@Import({SecurityConfig.class, ApiSecurityErrorHandler.class, LocaleConfig.class, RestaurantAuthorization.class})
class CustomerDeliveryCheckoutControllerHttpTest {
    private final UUID customer = UUID.randomUUID();
    private final UUID restaurant = UUID.randomUUID();
    private final UUID product = UUID.randomUUID();
    private final UUID key = UUID.randomUUID();
    private final String base = "/api/v1/customer/restaurants/" + restaurant + "/orders/delivery";

    @Autowired private MockMvc mvc;
    @MockitoBean private JwtDecoder decoder;
    @MockitoBean private RestaurantMemberRepository memberships;
    @MockitoBean private DeliveryRepository deliveries;
    @MockitoBean private CustomerDeliveryCheckoutService checkout;
    @MockitoBean private OrderService legacyOrders;

    @Test
    void allCheckoutRoutesRequireAuthentication() throws Exception {
        mvc.perform(post(base + "/quote").contentType(MediaType.APPLICATION_JSON).content(body()))
                .andExpect(status().isUnauthorized());
        mvc.perform(post(base + "/checkout").contentType(MediaType.APPLICATION_JSON).content(body()))
                .andExpect(status().isUnauthorized());
        mvc.perform(get(base + "/checkout").header("Idempotency-Key", key))
                .andExpect(status().isUnauthorized());
        mvc.perform(delete(base + "/checkout").header("Idempotency-Key", key))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(checkout);
    }

    @Test
    void temporaryQuoteIsPrivateAndUsesJwtCustomerAndPathRestaurant() throws Exception {
        var destination = new CustomerDeliveryQuote.Destination("GPS_CONFIRMED", null, "16 Garden Road",
                "Yangon", "Tamwe", BigDecimal.ZERO, new BigDecimal("96.15"), "Recipient", "09123456", null);
        when(checkout.quote(eq(restaurant), eq(customer), any())).thenReturn(new CustomerDeliveryQuote(
                restaurant, "Restaurant", "MMK", 1000, 250, 0, 1250, "CASH_ON_DELIVERY", destination,
                List.of(), "a".repeat(64), key));
        mvc.perform(post(base + "/quote").with(jwt().jwt(token -> token.subject(customer.toString())).authorities())
                        .contentType(MediaType.APPLICATION_JSON).content(body()))
                .andExpect(status().isOk()).andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andExpect(jsonPath("$.idempotencyKey").value(key.toString()))
                .andExpect(jsonPath("$.destination.source").value("GPS_CONFIRMED"))
                .andExpect(jsonPath("$.destination.latitude").value(0))
                .andExpect(jsonPath("$.totalAmount").value(1250));
        var request = ArgumentCaptor.forClass(CustomerDeliveryCheckoutRequest.class);
        verify(checkout).quote(eq(restaurant), eq(customer), request.capture());
        assertEquals(product, request.getValue().items().getFirst().productId());
        assertEquals("16 Garden Road", request.getValue().temporaryDestination().address());
        verifyNoInteractions(memberships, deliveries, legacyOrders);
    }

    @Test
    void checkoutAndRecoveryReturnOriginalReceiptPrivately() throws Exception {
        UUID orderId = UUID.randomUUID();
        var receipt = new CreateOrderResponse(orderId, "ORD-TEST", "DELIVERY", "CUSTOMER_APP", "PENDING",
                "MMK", 1000, 250, 0, 1250, null);
        when(checkout.checkout(eq(restaurant), eq(customer), eq(key.toString()), any())).thenReturn(receipt);
        when(checkout.getReceipt(restaurant, customer, key.toString())).thenReturn(Optional.of(receipt));
        var auth = jwt().jwt(token -> token.subject(customer.toString()));
        mvc.perform(post(base + "/checkout").with(auth).header("Idempotency-Key", key)
                        .contentType(MediaType.APPLICATION_JSON).content(body()))
                .andExpect(status().isCreated()).andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andExpect(jsonPath("$.orderId").value(orderId.toString()))
                .andExpect(jsonPath("$.status").value("PENDING"));
        mvc.perform(get(base + "/checkout").with(auth).header("Idempotency-Key", key))
                .andExpect(status().isOk()).andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andExpect(jsonPath("$.orderId").value(orderId.toString()));
        var other = jwt().jwt(token -> token.subject(UUID.randomUUID().toString()));
        mvc.perform(get(base + "/checkout").with(other).header("Idempotency-Key", key))
                .andExpect(status().isNotFound()).andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"));
    }

    @Test
    void abandonmentConfirmsRetirementOrReturnsTheReceiptPrivately() throws Exception {
        var receipt = new CreateOrderResponse(UUID.randomUUID(), "ORD-TEST", "DELIVERY", "CUSTOMER_APP", "PENDING",
                "MMK", 1000, 250, 0, 1250, null);
        when(checkout.abandon(restaurant, customer, key.toString())).thenReturn(Optional.of(receipt));
        mvc.perform(delete(base + "/checkout").with(jwt().jwt(token -> token.subject(customer.toString())))
                        .header("Idempotency-Key", key))
                .andExpect(status().isOk()).andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andExpect(jsonPath("$.orderId").value(receipt.orderId().toString()));
        UUID other = UUID.randomUUID();
        when(checkout.abandon(restaurant, other, key.toString())).thenReturn(Optional.empty());
        mvc.perform(delete(base + "/checkout").with(jwt().jwt(token -> token.subject(other.toString())))
                        .header("Idempotency-Key", key))
                .andExpect(status().isNoContent()).andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andExpect(content().string(""));
        verify(checkout).abandon(restaurant, customer, key.toString());
        verify(checkout).abandon(restaurant, other, key.toString());
    }

    private String body() {
        return """
                {"customerId":"%s", "restaurantId":"%s", "totalAmount":1,
                 "temporaryDestination":{"source":"GPS_CONFIRMED","address":"16 Garden Road",
                   "city":"Yangon","township":"Tamwe","latitude":0,"longitude":96.15},
                 "recipientName":"Recipient","recipientPhone":"09123456",
                 "items":[{"productId":"%s","quantity":1}], "confirmationToken":"%s"}
                """.formatted(UUID.randomUUID(), UUID.randomUUID(), product, "a".repeat(64));
    }
}
