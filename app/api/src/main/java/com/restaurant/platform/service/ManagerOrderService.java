
package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.order.ManagerOrderDetailDto;
import com.restaurant.platform.dto.order.OrderItemDetailDto;
import com.restaurant.platform.dto.order.OrderItemModifierDto;
import com.restaurant.platform.dto.order.OrderStatusHistoryDto;
import com.restaurant.platform.dto.order.OrderSummaryDto;
import com.restaurant.platform.dto.order.UpdateOrderStatusRequest;
import com.restaurant.platform.dto.order.OrderActionRequest;
import com.restaurant.platform.dto.order.OrderDeliveryAddressDto;
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
import com.restaurant.platform.accounting.AccountingSupport;
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
    private final DeliveryService deliveryService;
    private final CustomerOrderNotifications customerNotifications;
    private final OrderCancellationService cancellation;
    private AccountingSupport accounting;

    @org.springframework.beans.factory.annotation.Autowired
    public void setAccountingSupport(AccountingSupport accounting) { this.accounting = accounting; }

    public ManagerOrderService(
            OrderRepository orderRepository,
            OrderItemRepository orderItemRepository,
            OrderItemModifierRepository orderItemModifierRepository,
            OrderStatusHistoryRepository orderStatusHistoryRepository,
            QueueTicketRepository queueTicketRepository,
            AppNotificationRepository appNotificationRepository,
            RestaurantAuthorization restaurantAuthorization,
            DeliveryService deliveryService,
            CustomerOrderNotifications customerNotifications,
            OrderCancellationService cancellation
    ) {
        this.orderRepository = orderRepository;
        this.orderItemRepository = orderItemRepository;
        this.orderItemModifierRepository = orderItemModifierRepository;
        this.orderStatusHistoryRepository = orderStatusHistoryRepository;
        this.queueTicketRepository = queueTicketRepository;
        this.appNotificationRepository = appNotificationRepository;
        this.restaurantAuthorization = restaurantAuthorization;
        this.deliveryService = deliveryService;
        this.customerNotifications = customerNotifications;
        this.cancellation = cancellation;
    }

    @PreAuthorize("@restaurantAuthorization.hasPermission(#p0, T(com.restaurant.platform.security.RestaurantPermission).ORDER_READ)")
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
                    .findByRestaurantId(
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
                    .findByRestaurantIdAndStatus(
                            restaurantId,
                            normalizedStatus,
                            safePageable
                    );
        }

        // Bounded page, item, modifier and settled-payment queries; no per-order detail/history fetch.
        List<UUID> orderIds = orders.getContent().stream().map(Order::getId).toList();
        List<OrderItem> items = orderIds.isEmpty() ? List.of() : orderItemRepository
                .findByOrderIdInAndRestaurantIdOrderByCreatedAtAsc(orderIds, restaurantId);
        Map<UUID, List<OrderItem>> itemsByOrder = items.stream().collect(Collectors.groupingBy(OrderItem::getOrderId));
        Map<UUID, List<OrderItemModifier>> modifiers = loadModifiers(items, restaurantId);
        boolean showDelivery = restaurantAuthorization.hasPermission(restaurantId,
                RestaurantPermission.ORDER_DELIVERY_DETAILS_READ);
        boolean canUpdate = restaurantAuthorization.hasPermission(restaurantId, RestaurantPermission.ORDER_STATUS_UPDATE);
        boolean canCancel = restaurantAuthorization.hasPermission(restaurantId, RestaurantPermission.ORDER_CANCEL);
        boolean canCancelEarly = restaurantAuthorization.hasPermission(restaurantId, RestaurantPermission.ORDER_CANCEL_EARLY_UNPAID);
        Set<UUID> settledOrders = canUpdate && (canCancel || canCancelEarly)
                ? cancellation.settledOrderIds(restaurantId, orderIds) : Set.of();
        return orders.map(order -> toSummaryDto(order,
                itemDtos(itemsByOrder.getOrDefault(order.getId(), List.of()), modifiers), showDelivery,
                availableActions(order, canUpdate, canCancel, canCancelEarly, settledOrders.contains(order.getId()))));
    }

    @PreAuthorize("@restaurantAuthorization.hasPermission(#p0, T(com.restaurant.platform.security.RestaurantPermission).ORDER_READ)")
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

        var history = orderStatusHistoryRepository.findByOrderIdOrderByCreatedAtAsc(orderId);
        boolean showDeliveryDetails = !"DELIVERY".equals(order.getOrderType())
                || deliveryService.canViewOrderDeliveryDetails(order);

        List<OrderStatusHistoryDto> historyDtos = history
                .stream()
                .map(historyEntry -> {
                    UUID changedBy = historyEntry.getChangedByUserId();
                    boolean hideCustomerActor = !showDeliveryDetails && changedBy != null
                            && changedBy.equals(order.getCustomerId());
                    return new OrderStatusHistoryDto(
                            historyEntry.getId(),
                            historyEntry.getStatus(),
                            hideCustomerActor ? null : changedBy,
                            showDeliveryDetails ? historyEntry.getNote() : null,
                            historyEntry.getCreatedAt());
                })
                .toList();

        return new ManagerOrderDetailDto(
                order.getId(),
                order.getRestaurantId(),
                order.getOrderNumber(),
                showDeliveryDetails ? order.getCustomerId() : null,
                showDeliveryDetails ? order.getCreatedByUserId() : null,
                order.getTableId(),
                order.getQueueTicketId(),
                showDeliveryDetails ? order.getDeliveryZoneId() : null,
                order.getOrderType(),
                order.getOrderChannel(),
                order.getStatus(),
                order.getSubtotal(),
                order.getDeliveryFee(),
                order.getDiscountAmount(),
                order.getTotalAmount(),
                showDeliveryDetails ? order.getDeliveryName() : null,
                showDeliveryDetails ? order.getDeliveryPhone() : null,
                showDeliveryDetails ? order.getDeliveryAddress() : null,
                showDeliveryDetails ? order.getDeliveryNote() : null,
                order.getCreatedAt(),
                order.getUpdatedAt(),
                itemDtos,
                historyDtos,
                showDeliveryDetails ? order.getDeliveryCity() : null,
                showDeliveryDetails ? order.getDeliveryTownship() : null,
                showDeliveryDetails ? deliveryDestination(order) : null,
                availableActions(order));
    }

    @PreAuthorize("@restaurantAuthorization.hasPermission(#p0, T(com.restaurant.platform.security.RestaurantPermission).ORDER_STATUS_UPDATE)")
    @Transactional
    public OrderSummaryDto updateStatus(
            UUID restaurantId,
            UUID orderId,
            UUID userId,
            UpdateOrderStatusRequest request
    ) {
        return updateStatusInternal(restaurantId, orderId, userId, request, null);
    }

    @PreAuthorize("@restaurantAuthorization.hasPermission(#p0, T(com.restaurant.platform.security.RestaurantPermission).ORDER_STATUS_UPDATE)")
    @Transactional
    public OrderSummaryDto executeAction(UUID restaurantId, UUID orderId, UUID userId, OrderActionRequest request) {
        if (request == null || request.action() == null || request.expectedStatus() == null
                || !List.of("ACCEPT", "COMPLETE", "CANCEL").contains(request.action())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_ORDER_ACTION", "invalid-order-status-filter");
        }
        return updateStatusInternal(restaurantId, orderId, userId, null, request);
    }

    private OrderSummaryDto updateStatusInternal(UUID restaurantId, UUID orderId, UUID userId,
                                                UpdateOrderStatusRequest request, OrderActionRequest actionRequest) {
        // 1. Verify the authenticated user.
        restaurantAuthorization.requireAuthenticatedUserMatches(userId);

        // 2. Verify permission to update order status.
        restaurantAuthorization.requirePermission(
                restaurantId,
                RestaurantPermission.ORDER_STATUS_UPDATE
        );

        // 3. Validate the requested status.
        if (accounting != null) accounting.lock(restaurantId);
        if (actionRequest == null && (request == null
                || request.status() == null
                || request.status().isBlank())) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "ORDER_STATUS_REQUIRED",
                    "order-status-required"
            );
        }

        String nextStatus = actionRequest == null ? request.status().trim() : "ACCEPTED";

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
        boolean simplifiedComplete = false;
        if (actionRequest != null) {
            if (!currentStatus.equals(actionRequest.expectedStatus())) {
                throw new ApiException(HttpStatus.CONFLICT, "ORDER_ACTION_STALE", "invalid-order-status-transition",
                        actionRequest.expectedStatus(), currentStatus);
            }
            nextStatus = switch (actionRequest.action()) {
                case "ACCEPT" -> "ACCEPTED";
                case "CANCEL" -> "CANCELLED";
                case "COMPLETE" -> "DELIVERY".equals(orderType) || order.getQueueTicketId() != null
                        ? "READY" : "COMPLETED";
                default -> throw new IllegalStateException("Validated order action");
            };
            simplifiedComplete = "COMPLETE".equals(actionRequest.action())
                    && List.of("ACCEPTED", "PREPARING").contains(currentStatus);
        }

        // 5. Validate the status transition.
        if (!simplifiedComplete && !isAllowedTransition(
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
            if (actionRequest == null || restaurantAuthorization.hasPermission(restaurantId, RestaurantPermission.ORDER_CANCEL)) {
                restaurantAuthorization.requirePermission(restaurantId, RestaurantPermission.ORDER_CANCEL);
            } else {
                restaurantAuthorization.requirePermission(restaurantId, RestaurantPermission.ORDER_CANCEL_EARLY_UNPAID);
                if (!List.of("PENDING", "ACCEPTED").contains(currentStatus)) {
                    throw new ApiException(HttpStatus.FORBIDDEN, "EARLY_CANCELLATION_ONLY", "error.authorization.permission_denied");
                }
                cancellation.requireUnpaid(order);
            }
            String reason = actionRequest == null ? request.note() : actionRequest.reason();
            if (reason == null || reason.trim().length() < 10 || reason.trim().length() > 500) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "CANCELLATION_REASON_REQUIRED", "error.order.cancellation-reason-required");
            }
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

        // Keep delivery and order workflow state in sync for manager-driven transitions.
        if ("DELIVERY".equals(orderType)
                && ("OUT_FOR_DELIVERY".equals(nextStatus)
                || "COMPLETED".equals(nextStatus))) {
            deliveryService.synchronizeManagerOrderStatus(order, userId, nextStatus);
        }

        String historyNote = actionRequest == null ? request.note() : actionRequest.reason();
        if (actionRequest != null && "COMPLETE".equals(actionRequest.action())) {
            String meaning = "READY".equals(nextStatus) ? "Preparation completed; ready for handoff."
                    : "Restaurant fulfillment completed; payment collection remains separate.";
            historyNote = historyNote == null || historyNote.isBlank() ? meaning : historyNote.trim() + "\n" + meaning;
        }
        if ("CANCELLED".equals(nextStatus)) {
            String disposition = "DELIVERY".equals(orderType) && "CUSTOMER_APP".equals(order.getOrderChannel())
                    ? cancellation.settleUnpaidOrder(order)
                    : cancellation.closePendingCounterPayments(order);
            historyNote = historyNote == null || historyNote.isBlank() ? disposition : historyNote + "\n" + disposition;
        }

        // 9. Update and save the order.
        order.setStatus(nextStatus);
        orderRepository.save(order);

        // 10. Record the status change.
        OrderStatusHistory history = new OrderStatusHistory();
        history.setOrderId(order.getId());
        history.setChangedByUserId(userId);
        history.setStatus(nextStatus);
        history.setNote(historyNote);

        orderStatusHistoryRepository.save(history);
        customerNotifications.orderStatusChanged(order);

        // Create a delivery task as soon as a delivery order becomes READY.
        if ("READY".equals(nextStatus) && "DELIVERY".equals(orderType)) {
            deliveryService.ensureForReadyOrder(order, userId);
        }

        // 11. Synchronize queue status and create notifications.
        if (queueStatusWillChange) {
            QueueTicket ticket = queueTicketRepository
                    .findByIdAndRestaurantIdForUpdate(order.getQueueTicketId(), restaurantId)
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
                if (order.getCustomerId() != null) {
                    notification.setUserId(order.getCustomerId());
                }
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
        return toSummaryDto(order, List.of(), restaurantAuthorization.hasPermission(order.getRestaurantId(),
                RestaurantPermission.ORDER_DELIVERY_DETAILS_READ), availableActions(order));
    }

    private OrderSummaryDto toSummaryDto(Order order, List<OrderItemDetailDto> items, boolean showDelivery, List<String> actions) {
        return new OrderSummaryDto(
                order.getId(),
                order.getOrderNumber(),
                order.getOrderType(),
                order.getOrderChannel(),
                order.getStatus(),
                order.getSubtotal(),
                order.getDeliveryFee(),
                order.getTotalAmount(),
                order.getCreatedAt(),
                order.getQueueTicketId(),
                items,
                showDelivery ? deliveryDestination(order) : null,
                !"DELIVERY".equals(order.getOrderType()) ? order.getDeliveryNote() : null,
                actions
        );
    }

    private List<String> availableActions(Order order) {
        UUID restaurantId = order.getRestaurantId();
        if (!restaurantAuthorization.hasPermission(restaurantId, RestaurantPermission.ORDER_STATUS_UPDATE)) return List.of();
        return availableActions(order,
                true,
                restaurantAuthorization.hasPermission(restaurantId, RestaurantPermission.ORDER_CANCEL),
                restaurantAuthorization.hasPermission(restaurantId, RestaurantPermission.ORDER_CANCEL_EARLY_UNPAID),
                cancellation.settledOrderIds(restaurantId, List.of(order.getId())).contains(order.getId()));
    }

    private List<String> availableActions(Order order, boolean canUpdate, boolean canCancel,
                                          boolean canCancelEarly, boolean settled) {
        if (!canUpdate) return List.of();
        var actions = new java.util.ArrayList<String>();
        String state = order.getStatus();
        if ("PENDING".equals(state)) actions.add("ACCEPT");
        if (List.of("ACCEPTED", "PREPARING").contains(state)
                || "READY".equals(state) && !"DELIVERY".equals(order.getOrderType()) && order.getQueueTicketId() == null) {
            actions.add("COMPLETE");
        }
        boolean fullCancellation = canCancel && !settled && List.of("PENDING", "ACCEPTED", "PREPARING").contains(state);
        if (fullCancellation || canCancelEarly && !settled && List.of("PENDING", "ACCEPTED").contains(state)) actions.add("CANCEL");
        return List.copyOf(actions);
    }

    private OrderDeliveryAddressDto deliveryDestination(Order order) {
        if (!"DELIVERY".equals(order.getOrderType())) return null;
        return new OrderDeliveryAddressDto(order.getDeliveryRegionId(), order.getDeliveryDistrictId(),
                order.getDeliveryTownshipId(), order.getDeliveryRegionName() == null ? order.getDeliveryCity() : order.getDeliveryRegionName(),
                order.getDeliveryDistrictName(), order.getDeliveryTownship(), order.getDeliveryWard(),
                order.getDeliveryStreet(), order.getDeliveryHouseNo(), order.getDeliveryAddress(),
                order.getDeliveryName(), order.getDeliveryPhone(), order.getDeliveryNote());
    }

    private Map<UUID, List<OrderItemModifier>> loadModifiers(List<OrderItem> items, UUID restaurantId) {
        if (items.isEmpty()) return Map.of();
        return orderItemModifierRepository.findByOrderItemIdInAndRestaurantIdOrderByIdAsc(
                items.stream().map(OrderItem::getId).toList(), restaurantId).stream()
                .collect(Collectors.groupingBy(OrderItemModifier::getOrderItemId));
    }

    private List<OrderItemDetailDto> itemDtos(List<OrderItem> items, Map<UUID, List<OrderItemModifier>> modifiers) {
        return items.stream().map(item -> new OrderItemDetailDto(item.getId(), item.getProductId(), item.getVariantId(),
                item.getProductName(), item.getVariantName(), item.getUnitPrice(), item.getQuantity(), item.getSubtotal(),
                item.getSpecialInstruction(), modifiers.getOrDefault(item.getId(), List.of()).stream()
                .map(modifier -> new OrderItemModifierDto(modifier.getId(), modifier.getModifierOptionId(),
                        modifier.getName(), modifier.getAdditionalPrice(), modifier.getQuantity())).toList())).toList();
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
