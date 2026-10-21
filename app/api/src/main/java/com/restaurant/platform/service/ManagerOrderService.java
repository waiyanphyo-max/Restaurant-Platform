
package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.order.ManagerOrderDetailDto;
import com.restaurant.platform.dto.order.OrderItemDetailDto;
import com.restaurant.platform.dto.order.OrderItemModifierDto;
import com.restaurant.platform.dto.order.OrderStatusHistoryDto;
import com.restaurant.platform.dto.order.OrderSummaryDto;
import com.restaurant.platform.dto.order.UpdateOrderStatusRequest;
import com.restaurant.platform.entity.AppNotification;
import com.restaurant.platform.entity.Order;
import com.restaurant.platform.entity.OrderItem;
import com.restaurant.platform.entity.OrderItemModifier;
import com.restaurant.platform.entity.OrderStatusHistory;
import com.restaurant.platform.entity.QueueTicket;
import com.restaurant.platform.repository.AppNotificationRepository;
import com.restaurant.platform.repository.OrderRepository;
import com.restaurant.platform.repository.OrderItemRepository;
import com.restaurant.platform.repository.OrderItemModifierRepository;
import com.restaurant.platform.repository.OrderStatusHistoryRepository;
import com.restaurant.platform.repository.QueueTicketRepository;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.security.RestaurantPermission;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.Locale;
import java.util.LinkedHashMap;
import java.util.stream.Collectors;
import java.util.UUID;

@Service
public class ManagerOrderService {

    private static final int MAX_PAGE_SIZE = 100;
    private static final Set<String> ALLOWED_SORT_FIELDS = Set.of(
            "createdAt", "orderNumber", "status", "orderType", "totalAmount");

    private static final List<String> VALID_ORDER_STATUSES = List.of(
            "PENDING",
            "ACCEPTED",
            "PREPARING",
            "READY",
            "OUT_FOR_DELIVERY",
            "COMPLETED",
            "CANCELLED"
    );

    private final OrderRepository orderRepository;
    private final OrderItemRepository orderItemRepository;
    private final OrderItemModifierRepository orderItemModifierRepository;
    private final OrderStatusHistoryRepository orderStatusHistoryRepository;
    private final QueueTicketRepository queueTicketRepository;
    private final AppNotificationRepository appNotificationRepository;
    private final RestaurantAuthorization restaurantAuthorization;

    public ManagerOrderService(
            OrderRepository orderRepository,
            OrderItemRepository orderItemRepository,
            OrderItemModifierRepository orderItemModifierRepository,
            OrderStatusHistoryRepository orderStatusHistoryRepository,
            QueueTicketRepository queueTicketRepository,
            AppNotificationRepository appNotificationRepository,
            RestaurantAuthorization restaurantAuthorization
    ) {
        this.orderRepository = orderRepository;
        this.orderItemRepository = orderItemRepository;
        this.orderItemModifierRepository = orderItemModifierRepository;
        this.orderStatusHistoryRepository = orderStatusHistoryRepository;
        this.queueTicketRepository = queueTicketRepository;
        this.appNotificationRepository = appNotificationRepository;
        this.restaurantAuthorization = restaurantAuthorization;
    }

    @PreAuthorize("@restaurantAuthorization.hasPermission(#restaurantId, T(com.restaurant.platform.security.RestaurantPermission).ORDER_READ)")
    @Transactional(readOnly = true)
    public Page<OrderSummaryDto> listOrders(
            UUID restaurantId,
            UUID userId,
            String status,
            Pageable pageable
    ) {
        restaurantAuthorization.requireAuthenticatedUserMatches(userId);
        restaurantAuthorization.requirePermission(
                restaurantId,
                RestaurantPermission.ORDER_READ
        );

        int page = Math.max(0, pageable.getPageNumber());
        int size = Math.max(
                1,
                Math.min(pageable.getPageSize(), MAX_PAGE_SIZE)
        );

        List<Sort.Order> requestedSorts = pageable.getSort().stream()
                .filter(order -> ALLOWED_SORT_FIELDS.contains(order.getProperty()))
                .map(order -> new Sort.Order(order.getDirection(), order.getProperty()))
                .toList();
        Sort safeSort = requestedSorts.isEmpty()
                ? Sort.by(Sort.Direction.DESC, "createdAt")
                : Sort.by(requestedSorts);

        Pageable safePageable = PageRequest.of(page, size, safeSort);

        String normalizedStatus = status == null || status.isBlank()
                ? null
                : status.trim().toUpperCase(Locale.ROOT);

        Page<Order> orders;

        if (normalizedStatus == null || normalizedStatus.isBlank()) {
            orders = orderRepository
                    .findByRestaurantIdOrderByCreatedAtDesc(
                            restaurantId,
                            safePageable
                    );
        } else {
            if (!VALID_ORDER_STATUSES.contains(normalizedStatus)) {
                throw new ApiException(
                        HttpStatus.BAD_REQUEST,
                        "INVALID_ORDER_STATUS_FILTER",
                        "invalid-order-status-filter"
                );
            }

            orders = orderRepository
                    .findByRestaurantIdAndStatusOrderByCreatedAtDesc(
                            restaurantId,
                            normalizedStatus,
                            safePageable
                    );
        }

        return orders.map(this::toSummaryDto);
    }

    @PreAuthorize("@restaurantAuthorization.hasPermission(#restaurantId, T(com.restaurant.platform.security.RestaurantPermission).ORDER_READ)")
    @Transactional(readOnly = true)
    public ManagerOrderDetailDto getOrderDetail(UUID restaurantId, UUID orderId) {
        restaurantAuthorization.requirePermission(restaurantId, RestaurantPermission.ORDER_READ);

        Order order = orderRepository.findByIdAndRestaurantId(orderId, restaurantId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "ORDER_NOT_FOUND",
                        "order-not-found"));

        List<OrderItem> items = orderItemRepository
                .findByOrderIdAndRestaurantIdOrderByCreatedAtAsc(orderId, restaurantId);

        List<UUID> itemIds = items.stream().map(OrderItem::getId).toList();
        Map<UUID, List<OrderItemModifier>> modifiersByItemId;
        if (itemIds.isEmpty()) {
            modifiersByItemId = Map.of();
        } else {
            modifiersByItemId = orderItemModifierRepository
                    .findByOrderItemIdInAndRestaurantIdOrderByIdAsc(itemIds, restaurantId)
                    .stream()
                    .collect(Collectors.groupingBy(
                            OrderItemModifier::getOrderItemId,
                            LinkedHashMap::new,
                            Collectors.toList()));
        }

        List<OrderItemDetailDto> itemDtos = items.stream()
                .map(item -> new OrderItemDetailDto(
                        item.getId(),
                        item.getProductId(),
                        item.getVariantId(),
                        item.getProductName(),
                        item.getVariantName(),
                        item.getUnitPrice(),
                        item.getQuantity(),
                        item.getSubtotal(),
                        item.getSpecialInstruction(),
                        modifiersByItemId.getOrDefault(item.getId(), List.of()).stream()
                                .map(modifier -> new OrderItemModifierDto(
                                        modifier.getId(),
                                        modifier.getModifierOptionId(),
                                        modifier.getName(),
                                        modifier.getAdditionalPrice(),
                                        modifier.getQuantity()))
                                .toList()))
                .toList();

        List<OrderStatusHistoryDto> historyDtos = orderStatusHistoryRepository
                .findByOrderIdOrderByCreatedAtAsc(orderId)
                .stream()
                .map(history -> new OrderStatusHistoryDto(
                        history.getId(),
                        history.getStatus(),
                        history.getChangedByUserId(),
                        history.getNote(),
                        history.getCreatedAt()))
                .toList();

        return new ManagerOrderDetailDto(
                order.getId(),
                order.getRestaurantId(),
                order.getOrderNumber(),
                order.getCustomerId(),
                order.getCreatedByUserId(),
                order.getTableId(),
                order.getQueueTicketId(),
                order.getDeliveryZoneId(),
                order.getOrderType(),
                order.getOrderChannel(),
                order.getStatus(),
                order.getSubtotal(),
                order.getDeliveryFee(),
                order.getDiscountAmount(),
                order.getTotalAmount(),
                order.getDeliveryName(),
                order.getDeliveryPhone(),
                order.getDeliveryAddress(),
                order.getDeliveryNote(),
                order.getCreatedAt(),
                order.getUpdatedAt(),
                itemDtos,
                historyDtos);
    }

    @PreAuthorize("@restaurantAuthorization.hasPermission(#restaurantId, T(com.restaurant.platform.security.RestaurantPermission).ORDER_STATUS_UPDATE)")
    @Transactional
    public OrderSummaryDto updateStatus(
            UUID restaurantId,
            UUID orderId,
            UUID userId,
            UpdateOrderStatusRequest request
    ) {
        // 1. Verify the authenticated user.
        restaurantAuthorization.requireAuthenticatedUserMatches(userId);

        // 2. Verify permission to update order status.
        restaurantAuthorization.requirePermission(
                restaurantId,
                RestaurantPermission.ORDER_STATUS_UPDATE
        );

        // 3. Validate the requested status.
        if (request == null
                || request.status() == null
                || request.status().isBlank()) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "ORDER_STATUS_REQUIRED",
                    "order-status-required"
            );
        }

        String nextStatus = request.status().trim();

        if (!VALID_ORDER_STATUSES.contains(nextStatus)) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "INVALID_ORDER_STATUS",
                    "invalid-order-status-filter"
            );
        }

        // 4. Find the order belonging to this restaurant.
        Order order = orderRepository
                .findByIdAndRestaurantIdForUpdate(orderId, restaurantId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "ORDER_NOT_FOUND",
                        "order-not-found"
                ));

        String currentStatus = order.getStatus();
        String orderType = order.getOrderType();

        // 5. Validate the status transition.
        if (!isAllowedTransition(
                currentStatus,
                nextStatus,
                orderType
        )) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "INVALID_ORDER_STATUS_TRANSITION",
                    "invalid-order-status-transition",
                    currentStatus,
                    nextStatus
            );
        }

        // 6. Cancellation requires its own permission.
        if ("CANCELLED".equals(nextStatus)) {
            restaurantAuthorization.requirePermission(
                    restaurantId,
                    RestaurantPermission.ORDER_CANCEL
            );
        }

        // 7. Delivery-specific status transitions need permission.
        if (isDeliveryStatusTransition(
                currentStatus,
                nextStatus,
                orderType
        )) {
            restaurantAuthorization.requirePermission(
                    restaurantId,
                    RestaurantPermission.DELIVERY_STATUS_UPDATE
            );
        }

        // 8. Queue updates require queue-management permission.
        boolean queueStatusWillChange =
                order.getQueueTicketId() != null
                        && List.of("READY", "COMPLETED", "CANCELLED")
                        .contains(nextStatus);

        if (queueStatusWillChange) {
            restaurantAuthorization.requirePermission(
                    restaurantId,
                    RestaurantPermission.QUEUE_MANAGE
            );
        }

        // 9. Update and save the order.
        order.setStatus(nextStatus);
        orderRepository.save(order);

        // 10. Record the status change.
        OrderStatusHistory history = new OrderStatusHistory();
        history.setOrderId(order.getId());
        history.setChangedByUserId(userId);
        history.setStatus(nextStatus);
        history.setNote(request.note());

        orderStatusHistoryRepository.save(history);

        // 11. Synchronize queue status and create notifications.
        if (queueStatusWillChange) {
            QueueTicket ticket = queueTicketRepository
                    .findById(order.getQueueTicketId())
                    .orElseThrow(() -> new ResponseStatusException(
                            HttpStatus.CONFLICT,
                            "Queue ticket not found"
                    ));

            OffsetDateTime now =
                    OffsetDateTime.now(ZoneOffset.UTC);

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

        // 12. Return the updated order.
        return toSummaryDto(order);
    }

    private boolean isDeliveryStatusTransition(
            String currentStatus,
            String nextStatus,
            String orderType
    ) {
        if (!"DELIVERY".equals(orderType)) {
            return false;
        }

        return ("READY".equals(currentStatus)
                && "OUT_FOR_DELIVERY".equals(nextStatus))
                || ("OUT_FOR_DELIVERY".equals(currentStatus)
                && "COMPLETED".equals(nextStatus));
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
