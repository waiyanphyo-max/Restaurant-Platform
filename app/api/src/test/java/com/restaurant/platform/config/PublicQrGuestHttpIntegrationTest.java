package com.restaurant.platform.config;

import com.restaurant.platform.common.error.ApiSecurityErrorHandler;
import com.restaurant.platform.controller.PublicOrderController;
import com.restaurant.platform.controller.PublicQrContextController;
import com.restaurant.platform.controller.QueueTrackingController;
import com.restaurant.platform.dto.order.*;
import com.restaurant.platform.service.OrderService;
import com.restaurant.platform.service.QueueTrackingService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.hamcrest.Matchers.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Actual anonymous Spring HTTP/security and credential transport contract. */
@WebMvcTest(controllers = {PublicQrContextController.class, PublicOrderController.class, QueueTrackingController.class},
        properties = {
                "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://auth.example.test/auth/v1",
                "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=https://auth.example.test/auth/v1/.well-known/jwks.json"
        })
@Import({SecurityConfig.class, ApiSecurityErrorHandler.class, LocaleConfig.class})
class PublicQrGuestHttpIntegrationTest {
    @Autowired private MockMvc http;
    @MockitoBean private JwtDecoder jwtDecoder;
    @MockitoBean private OrderService orders;
    @MockitoBean private QueueTrackingService queues;

    @Test
    void anonymousQrValidationHasNoCacheAndNoCredentialInResponse() throws Exception {
        UUID restaurant = UUID.randomUUID();
        UUID table = UUID.randomUUID();
        when(orders.validateQrContext(eq(restaurant), any())).thenReturn(new QrContextResponse(
                restaurant, QrContextRequest.Kind.TABLE_QR, table, "12"));
        http.perform(post("/api/v1/public/restaurants/{id}/qr-context", restaurant)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"kind\":\"TABLE_QR\",\"qrToken\":\"private-token\"}"))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", containsString("no-store")))
                .andExpect(jsonPath("$.restaurantId").value(restaurant.toString()))
                .andExpect(jsonPath("$.tableId").value(table.toString()))
                .andExpect(jsonPath("$.qrToken").doesNotExist())
                .andExpect(content().string(not(containsString("private-token"))));
        verify(orders).validateQrContext(restaurant,
                new QrContextRequest(QrContextRequest.Kind.TABLE_QR, "private-token"));
    }

    @Test
    void malformedPreflightAndEmptyCartAreRejectedBeforeCheckout() throws Exception {
        UUID restaurant = UUID.randomUUID();
        for (String body : new String[]{"{}", "{\"kind\":\"TABLE_QR\",\"qrToken\":\"\"}",
                "{\"kind\":\"UNSUPPORTED\",\"qrToken\":\"secret\"}"}) {
            http.perform(post("/api/v1/public/restaurants/{id}/qr-context", restaurant)
                            .contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isBadRequest());
        }
        http.perform(post("/api/v1/public/restaurants/{id}/orders/table-qr", restaurant)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"qrToken\":\"secret\",\"items\":[]}"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(orders);
    }

    @Test
    void checkoutKeepsIdempotencyKeyHeaderWithoutRequiringSupabaseLogin() throws Exception {
        UUID restaurant = UUID.randomUUID();
        when(orders.createTableQrOrder(eq(restaurant), any(), eq("guest-key-0001")))
                .thenReturn(new CreateOrderResponse(UUID.randomUUID(), "ORD-20261101-12345678",
                        "DINE_IN", "TABLE_QR", "PENDING", "MMK", 3500, 0, 0, 3500, null));
        http.perform(post("/api/v1/public/restaurants/{id}/orders/table-qr", restaurant)
                        .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", "guest-key-0001")
                        .content("{\"qrToken\":\"secret\",\"items\":[{\"productId\":\""
                                + UUID.randomUUID() + "\",\"quantity\":1}]}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.orderType").value("DINE_IN"));
        verify(orders).createTableQrOrder(eq(restaurant), any(), eq("guest-key-0001"));
    }

    @Test
    void publicQueueRoutesPassTokenAndOptionalRestaurantScopeInHeaders() throws Exception {
        UUID ticket = UUID.randomUUID();
        UUID restaurant = UUID.randomUUID();
        UUID notification = UUID.randomUUID();
        http.perform(get("/api/v1/public/queue-tickets/{ticket}/status", ticket)
                        .header("X-Queue-Token", "queue-secret").header("X-Restaurant-Id", restaurant))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", containsString("no-store")));
        http.perform(get("/api/v1/public/queue-tickets/{ticket}/notifications", ticket)
                        .header("X-Queue-Token", "queue-secret").header("X-Restaurant-Id", restaurant))
                .andExpect(status().isOk());
        http.perform(patch("/api/v1/public/queue-tickets/{ticket}/notifications/{notification}/read", ticket, notification)
                        .header("X-Queue-Token", "queue-secret").header("X-Restaurant-Id", restaurant))
                .andExpect(status().isOk());
        verify(queues).getStatus(ticket, "queue-secret", restaurant);
        verify(queues).getNotifications(ticket, "queue-secret", restaurant);
        verify(queues).markNotificationRead(ticket, notification, "queue-secret", restaurant);
    }

    @Test
    void legacyQueueClientsCanOmitRestaurantHeader() throws Exception {
        UUID ticket = UUID.randomUUID();
        http.perform(get("/api/v1/public/queue-tickets/{ticket}/status", ticket)
                        .header("X-Queue-Token", "legacy-token"))
                .andExpect(status().isOk());
        verify(queues).getStatus(ticket, "legacy-token", null);
    }
}
