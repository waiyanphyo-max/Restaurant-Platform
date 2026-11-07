package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.accounting.AccountingSupport;
import com.restaurant.platform.dto.customer.CustomerDeliveryStatusDto;
import com.restaurant.platform.dto.customer.CustomerOrderDetailDto;
import com.restaurant.platform.dto.customer.CustomerOrderStatusDto;
import com.restaurant.platform.dto.customer.CustomerOrderSummaryDto;
import com.restaurant.platform.dto.customer.CustomerPaymentDto;
import com.restaurant.platform.dto.customer.ReorderDeliveryOrderRequest;
import com.restaurant.platform.dto.order.CreateDeliveryOrderRequest;
import com.restaurant.platform.dto.order.CreateOrderItemRequest;
import com.restaurant.platform.dto.order.CreateOrderResponse;
import com.restaurant.platform.dto.order.ModifierSelectionRequest;
import com.restaurant.platform.dto.order.OrderItemDetailDto;
import com.restaurant.platform.dto.order.OrderItemModifierDto;
import com.restaurant.platform.entity.Delivery;
import com.restaurant.platform.entity.Order;
import com.restaurant.platform.entity.OrderItem;
import com.restaurant.platform.entity.OrderItemModifier;
import com.restaurant.platform.entity.OrderStatusHistory;
import com.restaurant.platform.entity.Payment;
import com.restaurant.platform.repository.DeliveryRepository;
import com.restaurant.platform.repository.DeliveryStatusHistoryRepository;
import com.restaurant.platform.repository.OrderItemModifierRepository;
import com.restaurant.platform.repository.OrderItemRepository;
import com.restaurant.platform.repository.OrderRepository;
import com.restaurant.platform.repository.OrderStatusHistoryRepository;
import com.restaurant.platform.repository.PaymentRepository;
import com.restaurant.platform.security.RestaurantAuthorization;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class CustomerOrderService {

    private static final int MAX_PAGE_SIZE = 100;
    private static final Set<String> VALID_STATUSES = Set.of(
            "PENDING", "ACCEPTED", "PREPARING", "READY",
            "OUT_FOR_DELIVERY", "COMPLETED", "CANCELLED");
    private static final Set<String> ALLOWED_SORTS = Set.of(
            "createdAt", "orderNumber", "status", "totalAmount");

    private final OrderRepository orderRepository;
    private final OrderItemRepository orderItemRepository;
    private final OrderItemModifierRepository modifierRepository;
    private final OrderStatusHistoryRepository historyRepository;
    private final PaymentRepository paymentRepository;
    private final DeliveryRepository deliveryRepository;
    private final DeliveryStatusHistoryRepository deliveryHistoryRepository;
    private final CustomerOrderNotifications notifications;
    private final RestaurantAuthorization authorization;
    private final OrderService orderService;
    private final OrderCancellationService cancellation;
    private AccountingSupport accounting;

    @org.springframework.beans.factory.annotation.Autowired
    public void setAccountingSupport(AccountingSupport accounting) { this.accounting = accounting; }

    public CustomerOrderService(
            OrderRepository orderRepository,
            OrderItemRepository orderItemRepository,
            OrderItemModifierRepository modifierRepository,
            OrderStatusHistoryRepository historyRepository,
            PaymentRepository paymentRepository,
            DeliveryRepository deliveryRepository,
            DeliveryStatusHistoryRepository deliveryHistoryRepository,
            CustomerOrderNotifications notifications,
            RestaurantAuthorization authorization,
            OrderService orderService,
            OrderCancellationService cancellation) {
        this.orderRepository = orderRepository;
        this.orderItemRepository = orderItemRepository;
        this.modifierRepository = modifierRepository;
        this.historyRepository = historyRepository;
        this.paymentRepository = paymentRepository;
        this.deliveryRepository = deliveryRepository;
        this.deliveryHistoryRepository = deliveryHistoryRepository;
        this.notifications = notifications;
        this.authorization = authorization;
        this.orderService = orderService;
        this.cancellation = cancellation;
    }

    @Transactional(readOnly = true)
    public Page<CustomerOrderSummaryDto> listMyOrders(
            UUID userId, String status, Pageable pageable) {
        authorization.requireAuthenticatedUserMatches(userId);
        String normalizedStatus = normalizeStatus(status);
        Pageable safePageable = safePageable(pageable);

        Page<Order> orders = normalizedStatus == null
                ? orderRepository.findByCustomerIdOrderByCreatedAtDesc(userId, safePageable)
                : orderRepository.findByCustomerIdAndStatusOrderByCreatedAtDesc(
                        userId, normalizedStatus, safePageable);
        return orders.map(this::toSummary);
    }

    @Transactional(readOnly = true)
    public Page<CustomerOrderSummaryDto> listMyDeliveryOrders(
            UUID restaurantId, UUID userId, String status, Pageable pageable) {
        authorization.requireAuthenticatedUserMatches(userId);
        return orderRepository.findCustomerDeliveryOrders(
                        restaurantId, userId, normalizeStatus(status), safePageable(pageable))
                .map(this::toSummary);
    }

    @Transactional(readOnly = true)
    public CustomerOrderDetailDto getMyDeliveryOrder(UUID restaurantId, UUID userId, UUID orderId) {
        authorization.requireAuthenticatedUserMatches(userId);
        return toDetail(orderRepository.findCustomerDeliveryOrder(restaurantId, userId, orderId)
                .orElseThrow(this::orderNotFound));
    }

    @Transactional(readOnly = true)
    public CustomerOrderDetailDto getMyOrder(UUID userId, UUID orderId) {
        authorization.requireAuthenticatedUserMatches(userId);
        return toDetail(orderRepository.findByIdAndCustomerId(orderId, userId)
                .orElseThrow(this::orderNotFound));
    }

    private CustomerOrderDetailDto toDetail(Order order) {
        List<OrderItem> items = orderItemRepository
                .findByOrderIdAndRestaurantIdOrderByCreatedAtAsc(
                        order.getId(), order.getRestaurantId());
        List<UUID> itemIds = items.stream().map(OrderItem::getId).toList();
        List<OrderItemModifier> modifiers = itemIds.isEmpty()
                ? List.of()
                : modifierRepository.findByOrderItemIdInAndRestaurantIdOrderByIdAsc(
                        itemIds, order.getRestaurantId());
        Map<UUID, List<OrderItemModifierDto>> modifiersByItem = modifiers.stream()
                .collect(Collectors.groupingBy(
                        OrderItemModifier::getOrderItemId,
                        Collectors.mapping(modifier -> new OrderItemModifierDto(
                                modifier.getId(), modifier.getModifierOptionId(),
                                modifier.getName(), modifier.getAdditionalPrice(),
                                modifier.getQuantity()), Collectors.toList())));

        List<OrderItemDetailDto> itemDtos = items.stream()
                .map(item -> new OrderItemDetailDto(
                        item.getId(), item.getProductId(), item.getVariantId(),
                        item.getProductName(), item.getVariantName(),
                        item.getUnitPrice(), item.getQuantity(), item.getSubtotal(),
                        item.getSpecialInstruction(),
                        modifiersByItem.getOrDefault(item.getId(), List.of())))
                .toList();

        List<CustomerOrderStatusDto> statusHistory = historyRepository
                .findByOrderIdOrderByCreatedAtAsc(order.getId())
                .stream()
                .map(history -> new CustomerOrderStatusDto(
                        history.getStatus(), history.getCreatedAt()))
                .toList();

        List<CustomerPaymentDto> payments = paymentRepository
                .findByOrderIdOrderByCreatedAtDesc(order.getId())
                .stream()
                .map(this::toPayment)
                .toList();

        CustomerDeliveryStatusDto delivery = deliveryRepository
                .findByOrderId(order.getId())
                .map(this::toDelivery)
                .orElse(null);

        return new CustomerOrderDetailDto(
                order.getId(), order.getRestaurantId(), order.getOrderNumber(),
                order.getOrderType(), order.getOrderChannel(), order.getStatus(),
                order.getSubtotal(), order.getDeliveryFee(), order.getDiscountAmount(),
                order.getTotalAmount(), order.getDeliveryName(), order.getDeliveryPhone(),
                order.getDeliveryAddress(), order.getDeliveryNote(), order.getCreatedAt(),
                order.getUpdatedAt(), itemDtos, statusHistory, payments, delivery,
                order.getDeliveryLatitude(), order.getDeliveryLongitude(),
                order.getDeliveryTownship(), order.getDeliveryCity(), order.getDeliveryLocationSource(),
                order.getDeliveryAddressId(), order.getDeliveryLocationSource() == null ? null : order.getCreatedAt(),
                "PENDING".equals(order.getStatus()) && payments.stream().noneMatch(payment -> "PAID".equals(payment.status())),
                order.getDeliveryCheckoutCurrency());
    }

    /**
     * Recreates a new delivery checkout from a previous completed/cancelled delivery.
     * Product prices, stock, variants, modifiers, minimums and fees are all revalidated
     * by OrderService; only product/variant/modifier identifiers and quantities are reused.
     */
    @Transactional
    public CreateOrderResponse reorderMyDeliveryOrder(
            UUID userId, UUID sourceOrderId, ReorderDeliveryOrderRequest request) {
        authorization.requireAuthenticatedUserMatches(userId);
        if (request == null || request.addressId() == null
                || request.deliveryZoneId() == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "CUSTOMER_REORDER_FIELDS_REQUIRED",
                    "error.customer-order.reorder-fields-required");
        }

        Order sourceOrder = orderRepository.findByIdAndCustomerId(sourceOrderId, userId)
                .orElseThrow(this::orderNotFound);
        if (!"DELIVERY".equals(sourceOrder.getOrderType())
                || (!"COMPLETED".equals(sourceOrder.getStatus())
                && !"CANCELLED".equals(sourceOrder.getStatus()))) {
            throw new ApiException(HttpStatus.CONFLICT,
                    "CUSTOMER_REORDER_NOT_ALLOWED",
                    "error.customer-order.reorder-not-allowed");
        }

        List<OrderItem> sourceItems = orderItemRepository
                .findByOrderIdAndRestaurantIdOrderByCreatedAtAsc(
                        sourceOrder.getId(), sourceOrder.getRestaurantId());
        if (sourceItems.isEmpty()) {
            throw new ApiException(HttpStatus.CONFLICT,
                    "CUSTOMER_REORDER_ITEMS_MISSING",
                    "error.customer-order.reorder-items-missing");
        }

        List<UUID> sourceItemIds = sourceItems.stream()
                .map(OrderItem::getId)
                .toList();
        List<OrderItemModifier> sourceModifiers = modifierRepository
                .findByOrderItemIdInAndRestaurantIdOrderByIdAsc(
                        sourceItemIds, sourceOrder.getRestaurantId());

        Map<UUID, List<ModifierSelectionRequest>> selectionsByItem =
                sourceModifiers.stream().collect(Collectors.groupingBy(
                        OrderItemModifier::getOrderItemId,
                        Collectors.mapping(modifier -> new ModifierSelectionRequest(
                                modifier.getModifierOptionId(), modifier.getQuantity()),
                                Collectors.toList())));

        List<CreateOrderItemRequest> checkoutItems = sourceItems.stream()
                .map(item -> new CreateOrderItemRequest(
                        item.getProductId(),
                        item.getVariantId(),
                        item.getQuantity(),
                        item.getSpecialInstruction(),
                        selectionsByItem.getOrDefault(item.getId(), List.of())))
                .toList();

        CreateDeliveryOrderRequest checkout = new CreateDeliveryOrderRequest(
                request.addressId(),
                request.deliveryZoneId(),
                request.recipientName(),
                request.recipientPhone(),
                request.deliveryNote(),
                request.paymentMethod(),
                checkoutItems);

        return orderService.createDeliveryOrder(
                sourceOrder.getRestaurantId(), userId, checkout);
    }

    @Transactional
    public CustomerOrderDetailDto cancelMyDeliveryOrder(UUID restaurantId, UUID userId, UUID orderId) {
        authorization.requireAuthenticatedUserMatches(userId);
        if (accounting != null) {
            accounting.lock(restaurantId);
        }
        return cancelOrder(orderRepository.findCustomerDeliveryOrderForUpdate(restaurantId, userId, orderId)
                .orElseThrow(this::orderNotFound), userId);
    }

    @Transactional
    public CustomerOrderDetailDto cancelMyOrder(UUID userId, UUID orderId) {
        authorization.requireAuthenticatedUserMatches(userId);
        if (accounting != null) {
            // A scalar projection avoids caching stale order status while awaiting the tenant lock.
            UUID restaurantId = orderRepository.findRestaurantIdByIdAndCustomerId(orderId, userId)
                    .orElseThrow(this::orderNotFound);
            accounting.lock(restaurantId);
        }
        return cancelOrder(orderRepository.findByIdAndCustomerIdForUpdate(orderId, userId)
                .orElseThrow(this::orderNotFound), userId);
    }

    private CustomerOrderDetailDto cancelOrder(Order order, UUID userId) {
        if (!"PENDING".equals(order.getStatus())) {
            throw new ApiException(HttpStatus.CONFLICT,
                    "CUSTOMER_ORDER_CANNOT_BE_CANCELLED",
                    "error.customer-order.cancel-not-allowed");
        }

        String disposition = cancellation.settleUnpaidOrder(order);
        order.setStatus("CANCELLED");
        orderRepository.save(order);

        OrderStatusHistory history = new OrderStatusHistory();
        history.setOrderId(order.getId());
        history.setChangedByUserId(userId);
        history.setStatus("CANCELLED");
        history.setNote("Cancelled by customer before restaurant acceptance. " + disposition);
        historyRepository.save(history);

        notifications.orderStatusChanged(order);
        return toDetail(order);
    }

    private ApiException orderNotFound() {
        return new ApiException(HttpStatus.NOT_FOUND,
                "CUSTOMER_ORDER_NOT_FOUND", "error.customer-order.not-found");
    }

    private CustomerOrderSummaryDto toSummary(Order order) {
        return new CustomerOrderSummaryDto(
                order.getId(), order.getRestaurantId(), order.getOrderNumber(),
                order.getOrderType(), order.getOrderChannel(), order.getStatus(),
                order.getSubtotal(), order.getDeliveryFee(), order.getDiscountAmount(),
                order.getTotalAmount(), order.getCreatedAt(), order.getDeliveryCheckoutCurrency());
    }

    private CustomerPaymentDto toPayment(Payment payment) {
        return new CustomerPaymentDto(
                payment.getId(), payment.getMethod(), payment.getStatus(),
                payment.getAmount(), payment.getPaidAt(), payment.getCreatedAt());
    }

    private CustomerDeliveryStatusDto toDelivery(Delivery delivery) {
        List<CustomerOrderStatusDto> history = deliveryHistoryRepository
                .findByDeliveryIdOrderByCreatedAtAsc(delivery.getId()).stream()
                .map(event -> new CustomerOrderStatusDto(event.getStatus(), event.getCreatedAt()))
                .toList();
        return new CustomerDeliveryStatusDto(
                delivery.getId(), delivery.getStatus(), delivery.getAssignedAt(),
                delivery.getPickedUpAt(), delivery.getDeliveredAt(), history);
    }

    private String normalizeStatus(String status) {
        if (status == null || status.isBlank()) {
            return null;
        }
        String normalized = status.trim();
        if (!VALID_STATUSES.contains(normalized)) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "INVALID_CUSTOMER_ORDER_STATUS",
                    "error.customer-order.invalid-status");
        }
        return normalized;
    }

    private Pageable safePageable(Pageable pageable) {
        int page = pageable == null ? 0 : Math.max(0, pageable.getPageNumber());
        int size = pageable == null ? 20
                : Math.max(1, Math.min(pageable.getPageSize(), MAX_PAGE_SIZE));
        List<Sort.Order> accepted = pageable == null ? List.of()
                : pageable.getSort().stream()
                .filter(order -> ALLOWED_SORTS.contains(order.getProperty()))
                .toList();
        Sort sort = accepted.isEmpty()
                ? Sort.by(Sort.Direction.DESC, "createdAt")
                : Sort.by(accepted);
        return PageRequest.of(page, size, sort);
    }
}
