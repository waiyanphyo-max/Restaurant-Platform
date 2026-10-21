package com.restaurant.platform.controller;

import com.restaurant.platform.dto.order.QueueTicketManagerDto;
import com.restaurant.platform.service.QueueManagementService;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/restaurants/{restaurantId}/queue-tickets")
@RequiredArgsConstructor
public class QueueManagementController {

    private final QueueManagementService queueManagementService;

    @GetMapping
    public List<QueueTicketManagerDto> listQueue(
            @PathVariable UUID restaurantId,
            @RequestParam(required = false) String status) {
        return queueManagementService.listQueue(restaurantId, status);
    }

    @PatchMapping("/{ticketId}/call")
    public QueueTicketManagerDto callTicket(
            @PathVariable UUID restaurantId,
            @PathVariable UUID ticketId) {
        return queueManagementService.callTicket(restaurantId, ticketId);
    }
}
