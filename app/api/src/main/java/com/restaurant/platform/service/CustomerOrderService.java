package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.customer.CustomerDeliveryStatusDto;
import com.restaurant.platform.dto.customer.CustomerOrderDetailDto;
import com.restaurant.platform.dto.customer.CustomerOrderStatusDto;
import com.restaurant.platform.dto.customer.CustomerOrderSummaryDto;
import com.restaurant.platform.dto.customer.CustomerPaymentDto;
import com.restaurant.platform.dto.order.OrderItemDetailDto;
import com.restaurant.platform.dto.order.OrderItemModifierDto;
import com.restaurant.platform.entity.Delivery;
import com.restaurant.platform.entity.Order;
import com.restaurant.platform.entity.OrderItem;
import com.restaurant.platform.entity.OrderItemModifier;
import com.restaurant.platform.entity.OrderStatusHistory;
import com.restaurant.platform.entity.Payment;
import com.restaurant.platform.entity.Product;
import com.restaurant.platform.repository.DeliveryRepository;
import com.restaurant.platform.repository.OrderItemModifierRepository;
import com.restaurant.platform.repository.OrderItemRepository;
import com.restaurant.platform.repository.OrderRepository;
import com.restaurant.platform.repository.OrderStatusHistoryRepository;
import com.restaurant.platform.repository.PaymentRepository;
import com.restaurant.platform.repository.ProductRepository;
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
    private final ProductRepository productRepository;
    private final OrderItemModifierRepository modifierRepository;
    private final OrderStatusHistoryRepository historyRepository;
    private final PaymentRepository paymentRepository;
    private final DeliveryRepository deliveryRepository;
    private final RestaurantAuthorization authorization;

    public CustomerOrderService(
            OrderRepository orderRepository,
            OrderItemRepository orderItemRepository,
            ProductRepository productRepository,
            OrderItemModifierRepository modifierRepository,
            OrderStatusHistoryRepository historyRepository,
            PaymentRepository paymentRepository,
            DeliveryRepository deliveryRepository,
            RestaurantAuthorization authorization) {
        this.orderRepository = orderRepository;
        this.orderItemRepository = orderItemRepository;
        this.productRepository = productRepository;
        this.modifierRepository = modifierRepository;
        this.historyRepository = historyRepository;
        this.paymentRepository = paymentRepository;
        this.deliveryRepository = deliveryRepository;
        this.authorization = authorization;
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
    public CustomerOrderDetailDto getMyOrder(UUID userId, UUID orderId) {
        authorization.requireAuthenticatedUserMatches(userId);
        Order order = orderRepository.findByIdAndCustomerId(orderId, userId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "CUSTOMER_ORDER_NOT_FOUND",
                        "error.customer-order.not-found"));

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
                order.getUpdatedAt(), itemDtos, statusHistory, payments, delivery);
    }

    @Transactional
    public CustomerOrderDetailDto cancelMyOrder(UUID userId, UUID orderId) {
        authorization.requireAuthenticatedUserMatches(userId);
        Order order = orderRepository.findByIdAndCustomerIdForUpdate(orderId, userId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "CUSTOMER_ORDER_NOT_FOUND",
                        "error.customer-order.not-found"));

        if (!"PENDING".equals(order.getStatus())) {
            throw new ApiException(HttpStatus.CONFLICT,
                    "CUSTOMER_ORDER_CANNOT_BE_CANCELLED",
                    "error.customer-order.cancel-not-allowed");
        }

        List<OrderItem> items = orderItemRepository
                .findByOrderIdAndRestaurantIdOrderByCreatedAtAsc(
                        order.getId(), order.getRestaurantId());
        // Release reserved stock in the same transaction as cancellation.
        for (OrderItem item : items) {
            Product product = productRepository
                    .findByIdAndRestaurantId(item.getProductId(), order.getRestaurantId())
                    .orElseThrow(() -> new ApiException(
                            HttpStatus.CONFLICT,
                            "ORDER_PRODUCT_NOT_FOUND",
                            "error.customer-order.product-not-found"));
            if (Boolean.TRUE.equals(product.getTrackStock())) {
                int released = productRepository.releaseStock(
                        product.getId(), order.getRestaurantId(), item.getQuantity());
                if (released != 1) {
                    throw new ApiException(HttpStatus.CONFLICT,
                            "ORDER_STOCK_RELEASE_FAILED",
                            "error.customer-order.stock-release-failed");
                }
            }
        }

        for (Payment payment : paymentRepository
                .findByOrderIdOrderByCreatedAtDesc(order.getId())) {
            if ("PAID".equals(payment.getStatus())) {
                throw new ApiException(HttpStatus.CONFLICT,
                        "REFUND_REQUIRED",
                        "error.customer-order.refund-required");
            }
            if ("PENDING".equals(payment.getStatus())) {
                payment.setStatus("CANCELLED");
                paymentRepository.save(payment);
            }
        }

        order.setStatus("CANCELLED");
        orderRepository.save(order);

        OrderStatusHistory history = new OrderStatusHistory();
        history.setOrderId(order.getId());
        history.setChangedByUserId(userId);
        history.setStatus("CANCELLED");
        history.setNote("Cancelled by customer before restaurant acceptance.");
        historyRepository.save(history);

        return getMyOrder(userId, orderId);
    }

    private CustomerOrderSummaryDto toSummary(Order order) {
        return new CustomerOrderSummaryDto(
                order.getId(), order.getRestaurantId(), order.getOrderNumber(),
                order.getOrderType(), order.getOrderChannel(), order.getStatus(),
                order.getSubtotal(), order.getDeliveryFee(), order.getDiscountAmount(),
                order.getTotalAmount(), order.getCreatedAt());
    }

    private CustomerPaymentDto toPayment(Payment payment) {
        return new CustomerPaymentDto(
                payment.getId(), payment.getMethod(), payment.getStatus(),
                payment.getAmount(), payment.getPaidAt(), payment.getCreatedAt());
    }

    private CustomerDeliveryStatusDto toDelivery(Delivery delivery) {
        return new CustomerDeliveryStatusDto(
                delivery.getId(), delivery.getStatus(), delivery.getAssignedAt(),
                delivery.getPickedUpAt(), delivery.getDeliveredAt());
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
