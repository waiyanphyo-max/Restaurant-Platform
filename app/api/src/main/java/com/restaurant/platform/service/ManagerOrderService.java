package com.restaurant.platform.service;

import com.restaurant.platform.dto.order.OrderSummaryDto;
import com.restaurant.platform.dto.order.UpdateOrderStatusRequest;
import com.restaurant.platform.entity.*;
import com.restaurant.platform.repository.*;
import org.springframework.stereotype.Service;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

@Service
public class ManagerOrderService {

    private final OrderRepository orderRepository;
    private final RestaurantMemberRepository restaurantMemberRepository;
    private final OrderStatusHistoryRepository orderStatusHistoryRepository;
    private final QueueTicketRepository queueTicketRepository;
    private final AppNotificationRepository appNotificationRepository;

    public ManagerOrderService(OrderRepository orderRepository, RestaurantMemberRepository restaurantMemberRepository, OrderStatusHistoryRepository orderStatusHistoryRepository, QueueTicketRepository queueTicketRepository, AppNotificationRepository appNotificationRepository) {
        this.orderRepository = orderRepository;
        this.restaurantMemberRepository = restaurantMemberRepository;
        this.orderStatusHistoryRepository = orderStatusHistoryRepository;
        this.queueTicketRepository = queueTicketRepository;
        this.appNotificationRepository = appNotificationRepository;
    }

    @Transactional(readOnly = true)
    public Page<OrderSummaryDto> listOrders(
            UUID restaurantId,
            UUID userId,
            String status,
            Pageable pageable
    ) {
        requireManagerAccess(restaurantId, userId);

        int page = Math.max(0, pageable.getPageNumber());
        int size = Math.max(1, Math.min(pageable.getPageSize(), 100));

        Pageable safePageable = PageRequest.of(
                page,
                size,
                pageable.getSort()
        );

        Page<Order> orders;

        if (status == null || status.isBlank()) {
            orders = orderRepository
                    .findByRestaurantIdOrderByCreatedAtDesc(
                            restaurantId,
                            safePageable
                    );
        } else {
            List<String> validStatuses = List.of(
                    "PENDING",
                    "ACCEPTED",
                    "PREPARING",
                    "READY",
                    "OUT_FOR_DELIVERY",
                    "COMPLETED",
                    "CANCELLED"
            );

            if (!validStatuses.contains(status)) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Invalid order status filter"
                );
            }

            orders = orderRepository
                    .findByRestaurantIdAndStatusOrderByCreatedAtDesc(
                            restaurantId,
                            status,
                            safePageable
                    );
        }

        return orders.map(this::toSummaryDto);
    }

    private RestaurantMember requireManagerAccess(
            UUID restaurantId,
            UUID userId
    ) {
        RestaurantMember member = restaurantMemberRepository
                .findByRestaurantIdAndUserId(restaurantId, userId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.FORBIDDEN,
                        "Restaurant membership required"
                ));

        if (!List.of("OWNER", "MANAGER", "STAFF")
                .contains(member.getRole())) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Insufficient restaurant permissions"
            );
        }

        return member;
    }

    private OrderSummaryDto toSummaryDto(Order order) {
        return new OrderSummaryDto(
                order.getId(),
                order.getOrderNumber(),
                order.getOrderType(),
                order.getOrderChannel(),
                order.getStatus(),
                order.getSubtotal(),
                order.getDeliveryFee(),
                order.getTotalAmount(),
                order.getCreatedAt()
        );
    }

    @Transactional
    public OrderSummaryDto updateStatus(
            UUID restaurantId,
            UUID orderId,
            UUID userId,
            UpdateOrderStatusRequest request
    ) {
        // 1. Verify that the user has permission to manage this restaurant.
        requireManagerAccess(restaurantId, userId);

        // 2. Find the order belonging to this restaurant.
        Order order = orderRepository
                .findByIdAndRestaurantId(orderId, restaurantId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Order not found"
                ));

        String currentStatus = order.getStatus();
        String nextStatus = request.status();

        // 3. Validate the requested status transition.
        if (!isAllowedTransition(
                currentStatus,
                nextStatus,
                order.getOrderType()
        )) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Invalid order status transition from "
                            + currentStatus + " to " + nextStatus
            );
        }

        // 4. Update the order.
        order.setStatus(nextStatus);
        orderRepository.save(order);

        // 5. Record the status change.
        OrderStatusHistory history = new OrderStatusHistory();
        history.setOrderId(order.getId());
        history.setChangedByUserId(userId);
        history.setStatus(nextStatus);
        history.setNote(request.note());

        orderStatusHistoryRepository.save(history);

        // 6. Synchronize queue status and create a notification.
        if (order.getQueueTicketId() != null) {

            QueueTicket ticket = queueTicketRepository
                    .findById(order.getQueueTicketId())
                    .orElseThrow(() -> new ResponseStatusException(
                            HttpStatus.CONFLICT,
                            "Queue ticket not found"
                    ));

            OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);

            if ("READY".equals(nextStatus)) {
                ticket.setStatus("READY");
                ticket.setReadyAt(now);

                queueTicketRepository.save(ticket);

                AppNotification notification = new AppNotification();
                notification.setQueueTicketId(ticket.getId());
                notification.setOrderId(order.getId());
                notification.setNotificationType("QUEUE_READY");
                notification.setTitle("Your order is ready");
                notification.setBody(
                        "Queue " + ticket.getDisplayCode()
                                + " is ready for collection."
                );
                notification.setChannel("IN_APP");
                notification.setStatus("PENDING");

                appNotificationRepository.save(notification);

            } else if ("COMPLETED".equals(nextStatus)) {
                ticket.setStatus("COMPLETED");
                ticket.setCompletedAt(now);

                queueTicketRepository.save(ticket);

            } else if ("CANCELLED".equals(nextStatus)) {
                ticket.setStatus("CANCELLED");

                queueTicketRepository.save(ticket);
            }
        }

        // 7. Return the updated order summary.
        return new OrderSummaryDto(
                order.getId(),
                order.getOrderNumber(),
                order.getOrderType(),
                order.getOrderChannel(),
                order.getStatus(),
                order.getSubtotal(),
                order.getDeliveryFee(),
                order.getTotalAmount(),
                order.getCreatedAt()
        );
    }

    private boolean isAllowedTransition(
            String current,
            String next,
            String orderType
    ) {
        return switch (current) {
            case "PENDING" ->
                    List.of("ACCEPTED", "CANCELLED").contains(next);

            case "ACCEPTED" ->
                    List.of("PREPARING", "CANCELLED").contains(next);

            case "PREPARING" ->
                    List.of("READY", "CANCELLED").contains(next);

            case "READY" -> {
                if ("DELIVERY".equals(orderType)) {
                    yield "OUT_FOR_DELIVERY".equals(next);
                }

                yield "COMPLETED".equals(next);
            }

            case "OUT_FOR_DELIVERY" ->
                    "COMPLETED".equals(next);

            default -> false;
        };
    }
}
