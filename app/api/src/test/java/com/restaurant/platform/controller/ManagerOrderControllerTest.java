package com.restaurant.platform.controller;

import com.restaurant.platform.dto.order.OrderSummaryDto;
import com.restaurant.platform.dto.order.UpdateOrderStatusRequest;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.service.ManagerOrderService;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ManagerOrderControllerTest {

    private ManagerOrderService service;
    private RestaurantAuthorization authorization;
    private ManagerOrderController controller;

    private final UUID restaurantId = UUID.randomUUID();
    private final UUID orderId = UUID.randomUUID();
    private final UUID userId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        service = mock(ManagerOrderService.class);
        authorization = mock(RestaurantAuthorization.class);
        controller = new ManagerOrderController(service, authorization);
    }

    @Test
    void listUsesAuthenticatedSubjectAndPassesPaginationAndFilter() {
        var pageable = PageRequest.of(1, 10, Sort.by(Sort.Direction.DESC, "createdAt"));
        var expected = new PageImpl<>(List.of(summary()));
        when(authorization.requireAuthenticatedUserId()).thenReturn(userId);
        when(service.listOrders(restaurantId, userId, "READY", pageable)).thenReturn(expected);

        var actual = controller.listOrders(restaurantId, "READY", pageable);

        assertSame(expected, actual);
        verify(service).listOrders(restaurantId, userId, "READY", pageable);
    }

    @Test
    void statusUpdateUsesAuthenticatedSubjectRatherThanClientUserId() {
        var request = new UpdateOrderStatusRequest("ACCEPTED", "Accepted");
        var expected = summary();
        when(authorization.requireAuthenticatedUserId()).thenReturn(userId);
        when(service.updateStatus(restaurantId, orderId, userId, request)).thenReturn(expected);

        var actual = controller.updateOrderStatus(restaurantId, orderId, request);

        assertSame(expected, actual);
        verify(service).updateStatus(restaurantId, orderId, userId, request);
    }

    private OrderSummaryDto summary() {
        return new OrderSummaryDto(
                orderId, "ORD-001", "DINE_IN", "STAFF", "ACCEPTED",
                5000L, 0L, 5000L, OffsetDateTime.now());
    }
}
