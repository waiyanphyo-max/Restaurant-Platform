package com.restaurant.platform.service;

import com.restaurant.platform.dto.order.QueueTrackingResponse;
import com.restaurant.platform.entity.Order;
import com.restaurant.platform.entity.QueueTicket;
import com.restaurant.platform.repository.OrderRepository;
import com.restaurant.platform.repository.QueueTicketRepository;
import com.restaurant.platform.security.TokenUtils;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

@Service
public class QueueTrackingService {

    private final QueueTicketRepository queueTicketRepository;
    private final OrderRepository orderRepository;

    public QueueTrackingService(
            QueueTicketRepository queueTicketRepository,
            OrderRepository orderRepository
    ) {
        this.queueTicketRepository = queueTicketRepository;
        this.orderRepository = orderRepository;
    }

    @Transactional(readOnly = true)
    public QueueTrackingResponse getStatus(
            UUID ticketId,
            String rawToken
    ) {
        QueueTicket ticket = queueTicketRepository
                .findById(ticketId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Queue ticket not found"
                ));

        if (!TokenUtils.matches(
                rawToken,
                ticket.getPublicTokenHash()
        )) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Invalid tracking token"
            );
        }

        Order order = orderRepository
                .findByQueueTicketId(ticketId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Order not found"
                ));

        return new QueueTrackingResponse(
                ticket.getId(),
                ticket.getQueueNumber(),
                ticket.getDisplayCode(),
                ticket.getStatus(),
                order.getOrderNumber(),
                order.getStatus(),
                ticket.getCreatedAt(),
                ticket.getReadyAt(),
                ticket.getCompletedAt()
        );
    }
}