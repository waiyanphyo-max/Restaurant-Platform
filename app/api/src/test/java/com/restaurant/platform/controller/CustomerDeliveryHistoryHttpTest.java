package com.restaurant.platform.controller;

import com.restaurant.platform.common.error.ApiSecurityErrorHandler;
import com.restaurant.platform.config.LocaleConfig;
import com.restaurant.platform.config.SecurityConfig;
import com.restaurant.platform.entity.AppNotification;
import com.restaurant.platform.repository.AppNotificationRepository;
import com.restaurant.platform.repository.DeliveryRepository;
import com.restaurant.platform.repository.RestaurantMemberRepository;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.service.CustomerOrderService;
import com.restaurant.platform.service.NotificationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpHeaders;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(controllers = {CustomerDeliveryHistoryController.class, CustomerNotificationController.class}, properties = {
        "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://auth.example.test/auth/v1",
        "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=https://auth.example.test/auth/v1/.well-known/jwks.json"
})
@Import({SecurityConfig.class, ApiSecurityErrorHandler.class, LocaleConfig.class,
        RestaurantAuthorization.class, NotificationService.class})
class CustomerDeliveryHistoryHttpTest {
    private final UUID restaurant = UUID.randomUUID();
    private final UUID customer = UUID.randomUUID();
    private final UUID order = UUID.randomUUID();
    private final UUID noticeId = UUID.randomUUID();
    private final String base = "/api/v1/customer/restaurants/" + restaurant;

    @Autowired MockMvc mvc;
    @MockitoBean JwtDecoder decoder;
    @MockitoBean RestaurantMemberRepository members;
    @MockitoBean DeliveryRepository deliveries;
    @MockitoBean CustomerOrderService orders;
    @MockitoBean AppNotificationRepository notifications;

    @Test
    void protectedHistoryAndInboxRejectMissingAndExpiredSessions() throws Exception {
        when(decoder.decode("expired-token")).thenThrow(new BadJwtException("expired"));
        mvc.perform(get(base + "/orders").header(HttpHeaders.AUTHORIZATION, "Bearer expired-token"))
                .andExpect(status().isUnauthorized());
        mvc.perform(get(base + "/orders/" + order)).andExpect(status().isUnauthorized());
        mvc.perform(post(base + "/orders/" + order + "/cancel")).andExpect(status().isUnauthorized());
        mvc.perform(get(base + "/notifications")).andExpect(status().isUnauthorized());
        mvc.perform(patch(base + "/notifications/" + noticeId + "/read")).andExpect(status().isUnauthorized());
        verifyNoInteractions(orders, members, notifications);
    }

    @Test
    void historyUsesPathTenantAndJwtSubjectAndDisablesCaching() throws Exception {
        when(orders.listMyDeliveryOrders(eq(restaurant), eq(customer), eq("PENDING"), any()))
                .thenReturn(Page.empty());
        mvc.perform(get(base + "/orders").with(jwt().jwt(token -> token.subject(customer.toString())))
                        .param("status", "PENDING").param("customerId", UUID.randomUUID().toString())
                        .param("restaurantId", UUID.randomUUID().toString()))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andExpect(jsonPath("$.content").isEmpty());
        verify(orders).listMyDeliveryOrders(eq(restaurant), eq(customer), eq("PENDING"), any());
        verifyNoInteractions(members);
    }

    @Test
    void scopesInboxToCustomerAndRestaurantAndRejectsAnUnownedNotification() throws Exception {
        AppNotification notification = new AppNotification();
        notification.setId(noticeId);
        notification.setOrderId(order);
        notification.setNotificationType("ORDER_CREATED");
        notification.setChannel("IN_APP");
        when(notifications.findCustomerDeliveryNotifications(eq(restaurant), eq(customer), anySet(), eq("PENDING")))
                .thenReturn(List.of(notification));
        var identity = jwt().jwt(token -> token.subject(customer.toString()));
        mvc.perform(get(base + "/notifications").with(identity).param("status", "pending"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andExpect(jsonPath("$[0].orderId").value(order.toString()))
                .andExpect(jsonPath("$[0].notificationType").value("ORDER_CREATED"));

        UUID otherTenant = UUID.randomUUID();
        mvc.perform(patch("/api/v1/customer/restaurants/" + otherTenant + "/notifications/" + noticeId + "/read").with(identity))
                .andExpect(status().isNotFound());
        verify(notifications).findCustomerDeliveryNotificationForUpdate(eq(otherTenant), eq(customer), anySet(), eq(noticeId));
        verify(notifications, never()).save(any());

        when(notifications.findCustomerDeliveryNotificationForUpdate(eq(restaurant), eq(customer), anySet(), eq(noticeId)))
                .thenReturn(Optional.of(notification));
        when(notifications.save(notification)).thenReturn(notification);
        mvc.perform(patch(base + "/notifications/" + noticeId + "/read").with(identity))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andExpect(jsonPath("$.status").value("READ"))
                .andExpect(jsonPath("$.readAt").isNotEmpty());
        verifyNoInteractions(members);
    }
}
