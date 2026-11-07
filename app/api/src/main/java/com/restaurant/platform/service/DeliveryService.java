package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.accounting.AccountingSupport;
import com.restaurant.platform.dto.delivery.AssignDeliveryDriverRequest;
import com.restaurant.platform.dto.delivery.DefaultDeliveryDriverResponse;
import com.restaurant.platform.dto.delivery.DeliveryTaskDto;
import com.restaurant.platform.dto.delivery.UpdateDeliveryStatusRequest;
import com.restaurant.platform.entity.AppNotification;
import com.restaurant.platform.entity.Delivery;
import com.restaurant.platform.entity.DeliveryStatusHistory;
import com.restaurant.platform.entity.Order;
import com.restaurant.platform.entity.OrderStatusHistory;
import com.restaurant.platform.entity.Payment;
import com.restaurant.platform.entity.RestaurantMember;
import com.restaurant.platform.entity.RestaurantSettings;
import com.restaurant.platform.repository.AppNotificationRepository;
import com.restaurant.platform.repository.DeliveryRepository;
import com.restaurant.platform.repository.DeliveryStatusHistoryRepository;
import com.restaurant.platform.repository.OrderRepository;
import com.restaurant.platform.repository.OrderStatusHistoryRepository;
import com.restaurant.platform.repository.PaymentRepository;
import com.restaurant.platform.repository.RestaurantMemberRepository;
import com.restaurant.platform.repository.RestaurantSettingsRepository;
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

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

@Service
public class DeliveryService {

    private static final int MAX_PAGE_SIZE = 100;
    private static final Set<String> VALID_DELIVERY_STATUSES = Set.of(
            "WAITING_ASSIGNMENT", "ASSIGNED", "PICKED_UP",
            "DELIVERED", "FAILED", "CANCELLED");
    private static final Set<String> VALID_SORT_FIELDS = Set.of(
            "createdAt", "assignedAt", "pickedUpAt", "deliveredAt", "status");

    private final DeliveryRepository deliveryRepository;
    private final DeliveryStatusHistoryRepository deliveryHistoryRepository;
    private final OrderRepository orderRepository;
    private final OrderStatusHistoryRepository orderHistoryRepository;
    private final PaymentRepository paymentRepository;
    private final RestaurantSettingsRepository settingsRepository;
    private final RestaurantMemberRepository memberRepository;
    private final AppNotificationRepository notificationRepository;
    private final RestaurantAuthorization authorization;
    private AccountingSupport accounting;

    @org.springframework.beans.factory.annotation.Autowired
    public void setAccountingSupport(AccountingSupport accounting) { this.accounting = accounting; }

    public DeliveryService(
            DeliveryRepository deliveryRepository,
            DeliveryStatusHistoryRepository deliveryHistoryRepository,
            OrderRepository orderRepository,
            OrderStatusHistoryRepository orderHistoryRepository,
            PaymentRepository paymentRepository,
            RestaurantSettingsRepository settingsRepository,
            RestaurantMemberRepository memberRepository,
            AppNotificationRepository notificationRepository,
            RestaurantAuthorization authorization) {
        this.deliveryRepository = deliveryRepository;
        this.deliveryHistoryRepository = deliveryHistoryRepository;
        this.orderRepository = orderRepository;
        this.orderHistoryRepository = orderHistoryRepository;
        this.paymentRepository = paymentRepository;
        this.settingsRepository = settingsRepository;
        this.memberRepository = memberRepository;
        this.notificationRepository = notificationRepository;
        this.authorization = authorization;
    }

    @PreAuthorize("@restaurantAuthorization.hasPermission(#p0, T(com.restaurant.platform.security.RestaurantPermission).DELIVERY_READ)")
    @Transactional(readOnly = true)
    public Page<DeliveryTaskDto> listRestaurantDeliveries(
            UUID restaurantId, String status, Pageable pageable) {
        UUID currentUserId = authorization.requireAuthenticatedUserId();
        authorization.requirePermission(restaurantId, RestaurantPermission.DELIVERY_READ);
        String normalizedStatus = normalizeStatusFilter(status);
        Pageable safePageable = safePageable(pageable);

        Page<Delivery> deliveries = authorization.hasPermission(restaurantId, RestaurantPermission.DELIVERY_ASSIGN)
                ? deliveryRepository.findPageByRestaurantIdAndOptionalStatus(
                        restaurantId, normalizedStatus, safePageable)
                : deliveryRepository.findPageByDriverAndRestaurantIdAndOptionalStatus(
                        restaurantId, currentUserId, normalizedStatus, safePageable);
        return deliveries.map(delivery -> toTask(delivery, requireOrder(delivery, restaurantId)));
    }

    @PreAuthorize("@restaurantAuthorization.hasPermission(#p0, T(com.restaurant.platform.security.RestaurantPermission).DELIVERY_READ)")
    @Transactional(readOnly = true)
    public Page<DeliveryTaskDto> listMyDeliveries(
            UUID restaurantId, String status, Pageable pageable) {
        UUID userId = authorization.requireAuthenticatedUserId();
        authorization.requirePermission(restaurantId, RestaurantPermission.DELIVERY_READ);
        String normalizedStatus = normalizeStatusFilter(status);
        return deliveryRepository
                .findPageByDriverAndRestaurantIdAndOptionalStatus(
                        restaurantId, userId, normalizedStatus, safePageable(pageable))
                .map(delivery -> toTask(delivery, requireOrder(delivery, restaurantId)));
    }

    @Transactional(readOnly = true)
    public DeliveryTaskDto getDelivery(UUID restaurantId, UUID deliveryId) {
        Delivery delivery = authorization.requireDeliveryAccess(restaurantId, deliveryId);
        Order order = requireOrder(delivery, restaurantId);
        return toTask(delivery, order);
    }

    boolean canViewOrderDeliveryDetails(Order order) {
        UUID actorUserId = authorization.requireAuthenticatedUserId();
        return authorization.hasPermission(order.getRestaurantId(), RestaurantPermission.DELIVERY_ASSIGN)
                || deliveryRepository.existsByOrderIdAndDriverUserId(order.getId(), actorUserId);
    }

    @PreAuthorize("@restaurantAuthorization.hasPermission(#p0, T(com.restaurant.platform.security.RestaurantPermission).DELIVERY_ASSIGN)")
    @Transactional
    public DeliveryTaskDto assignDriver(
            UUID restaurantId,
            UUID deliveryId,
            UUID actorUserId,
            AssignDeliveryDriverRequest request) {
        authorization.requireAuthenticatedUserMatches(actorUserId);
        authorization.requirePermission(restaurantId, RestaurantPermission.DELIVERY_ASSIGN);
        if (request == null || request.driverUserId() == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "DELIVERY_DRIVER_REQUIRED", "error.delivery.driver-required");
        }

        Order order = lockOrderForDelivery(restaurantId, deliveryId);
        Delivery delivery = deliveryRepository.findByIdForUpdate(deliveryId)
                .orElseThrow(this::deliveryNotFound);
        requireDeliveryOrder(order);
        requireCurrentRevision(delivery, request.expectedUpdatedAt());
        requireAssignableStatus(delivery.getStatus());
        boolean retryAfterPickup = "FAILED".equals(delivery.getStatus())
                && "OUT_FOR_DELIVERY".equals(order.getStatus());
        if (!"READY".equals(order.getStatus()) && !retryAfterPickup) {
            throw new ApiException(HttpStatus.CONFLICT,
                    "DELIVERY_CANNOT_BE_REASSIGNED", "error.delivery.cannot-reassign");
        }

        RestaurantMember assignee = memberRepository
                .findEligibleDeliveryMemberForUpdate(restaurantId, request.driverUserId())
                .orElseThrow(() -> new ApiException(
                        HttpStatus.BAD_REQUEST,
                        "INVALID_DELIVERY_DRIVER",
                        "error.delivery.ineligible-assignee"));

        UUID previousAssignee = delivery.getDriverUserId();
        if (assignee.getUserId().equals(previousAssignee) && "ASSIGNED".equals(delivery.getStatus())) {
            return toTask(delivery, order);
        }

        if (retryAfterPickup) {
            order.setStatus("READY");
            orderRepository.save(order);
            recordOrderStatus(order, actorUserId, "READY",
                    "Delivery reassigned after a failed attempt.");
        }

        delivery.setDriverUserId(assignee.getUserId());
        delivery.setAssignedByUserId(actorUserId);
        delivery.setAssignedAt(OffsetDateTime.now(ZoneOffset.UTC));
        delivery.setPickedUpAt(null);
        delivery.setDeliveredAt(null);
        delivery.setFailureReason(null);
        delivery.setStatus("ASSIGNED");
        deliveryRepository.saveAndFlush(delivery);
        String assignment = previousAssignee == null
                ? "Assigned to " + assignee.getUserId() + "."
                : "Assignment changed from " + previousAssignee + " to " + assignee.getUserId() + ".";
        recordDeliveryStatus(delivery, actorUserId, "ASSIGNED", appendNote(assignment, request.note()));
        createNotification(assignee.getUserId(), order, "DELIVERY_ASSIGNED",
                "New delivery assigned",
                "Order " + order.getOrderNumber() + " is ready for delivery.");
        if (previousAssignee != null && !previousAssignee.equals(assignee.getUserId())) {
            createNotification(previousAssignee, order, "DELIVERY_REASSIGNED",
                    "Delivery reassigned",
                    "You are no longer assigned to order " + order.getOrderNumber() + ".");
        }
        return toTask(delivery, order);
    }

    @PreAuthorize("@restaurantAuthorization.hasPermission(#p0, T(com.restaurant.platform.security.RestaurantPermission).DELIVERY_STATUS_UPDATE)")
    @Transactional
    public DeliveryTaskDto updateDeliveryStatus(
            UUID restaurantId,
            UUID deliveryId,
            UUID actorUserId,
            UpdateDeliveryStatusRequest request) {
        authorization.requireAuthenticatedUserMatches(actorUserId);
        authorization.requirePermission(
                restaurantId, RestaurantPermission.DELIVERY_STATUS_UPDATE);
        if (accounting != null) accounting.lock(restaurantId);
        if (request == null || request.status() == null || request.status().isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "DELIVERY_STATUS_REQUIRED", "error.delivery.status-required");
        }

        String nextStatus = request.status().trim();
        if (!VALID_DELIVERY_STATUSES.contains(nextStatus)
                || "WAITING_ASSIGNMENT".equals(nextStatus)
                || "ASSIGNED".equals(nextStatus)) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "INVALID_DELIVERY_STATUS", "error.delivery.invalid-status");
        }

        Order order = lockOrderForDelivery(restaurantId, deliveryId);
        Delivery delivery = deliveryRepository.findByIdForUpdate(deliveryId)
                .orElseThrow(this::deliveryNotFound);
        requireLockedDeliveryAccess(order, delivery, actorUserId);
        requireDeliveryOrder(order);
        requireCurrentRevision(delivery, request.expectedUpdatedAt());

        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        String currentStatus = delivery.getStatus();

        switch (nextStatus) {
            case "PICKED_UP" -> {
                requireTransition("ASSIGNED".equals(currentStatus)
                                && "READY".equals(order.getStatus()),
                        currentStatus, nextStatus);
                delivery.setStatus("PICKED_UP");
                delivery.setPickedUpAt(now);
                order.setStatus("OUT_FOR_DELIVERY");
                orderRepository.save(order);
                recordOrderStatus(order, actorUserId, "OUT_FOR_DELIVERY",
                        "Driver picked up the delivery.");
                notifyCustomer(order, "DELIVERY_ON_THE_WAY",
                        "Your order is on the way",
                        "Order " + order.getOrderNumber() + " is on the way.");
            }
            case "DELIVERED" -> {
                requireTransition("PICKED_UP".equals(currentStatus)
                                && "OUT_FOR_DELIVERY".equals(order.getStatus()),
                        currentStatus, nextStatus);
                confirmCashOnDeliveryPayment(order, request.cashCollected(), now, actorUserId);
                delivery.setStatus("DELIVERED");
                delivery.setDeliveredAt(now);
                order.setStatus("COMPLETED");
                orderRepository.save(order);
                recordOrderStatus(order, actorUserId, "COMPLETED",
                        "Delivery was completed.");
                notifyCustomer(order, "DELIVERY_COMPLETED",
                        "Order delivered",
                        "Order " + order.getOrderNumber() + " has been delivered.");
            }
            case "FAILED" -> {
                requireTransition(
                        ("ASSIGNED".equals(currentStatus) && "READY".equals(order.getStatus()))
                                || ("PICKED_UP".equals(currentStatus) && "OUT_FOR_DELIVERY".equals(order.getStatus())),
                        currentStatus, nextStatus);
                if (request.failureReason() == null || request.failureReason().isBlank()) {
                    throw new ApiException(HttpStatus.BAD_REQUEST,
                            "DELIVERY_FAILURE_REASON_REQUIRED",
                            "error.delivery.failure-reason-required");
                }
                delivery.setStatus("FAILED");
                delivery.setFailureReason(request.failureReason().trim());
                notifyCustomer(order, "DELIVERY_FAILED",
                        "Delivery update",
                        "There was a problem delivering order " + order.getOrderNumber() + ".");
            }
            case "CANCELLED" -> {
                authorization.requirePermission(
                        restaurantId, RestaurantPermission.DELIVERY_ASSIGN);
                requireTransition(
                        "READY".equals(order.getStatus()) && ("WAITING_ASSIGNMENT".equals(currentStatus)
                                || "ASSIGNED".equals(currentStatus)),
                        currentStatus, nextStatus);
                delivery.setStatus("CANCELLED");
                notifyCustomer(order, "DELIVERY_CANCELLED", "Delivery cancelled",
                        "The delivery for order " + order.getOrderNumber() + " was cancelled.");
            }
            default -> throw new ApiException(HttpStatus.BAD_REQUEST,
                    "INVALID_DELIVERY_STATUS", "error.delivery.invalid-status");
        }

        deliveryRepository.saveAndFlush(delivery);
        String note = "FAILED".equals(nextStatus)
                ? appendNote("Failure reason: " + delivery.getFailureReason(), request.note())
                : (request.note() == null || request.note().isBlank() ? null : request.note().trim());
        recordDeliveryStatus(delivery, actorUserId, nextStatus, note);
        return toTask(delivery, order);
    }

    @Transactional(readOnly = true)
    public DefaultDeliveryDriverResponse getDefaultDriver(UUID restaurantId) {
        authorization.requirePermission(restaurantId, RestaurantPermission.SETTINGS_MANAGE);
        RestaurantSettings settings = requireSettings(restaurantId);
        return new DefaultDeliveryDriverResponse(
                restaurantId, settings.getDefaultDeliveryDriverUserId());
    }

    @Transactional
    public DefaultDeliveryDriverResponse setDefaultDriver(
            UUID restaurantId, UUID actorUserId, UUID driverUserId) {
        authorization.requireAuthenticatedUserMatches(actorUserId);
        authorization.requirePermission(restaurantId, RestaurantPermission.SETTINGS_MANAGE);
        if (driverUserId == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "DELIVERY_DRIVER_REQUIRED", "error.delivery.driver-required");
        }
        if (memberRepository.findEligibleDeliveryDrivers(restaurantId).stream()
                .noneMatch(member -> driverUserId.equals(member.getUserId()))) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "INVALID_DELIVERY_DRIVER",
                    "error.delivery.driver-not-member");
        }

        RestaurantSettings settings = requireSettings(restaurantId);
        settings.setDefaultDeliveryDriverUserId(driverUserId);
        settingsRepository.save(settings);
        return new DefaultDeliveryDriverResponse(restaurantId, driverUserId);
    }

    /**
     * Called when a delivery order becomes READY. If no default is configured,
     * the earliest-added eligible DELIVERY_DRIVER is selected and saved as the
     * restaurant's default. With no eligible driver, the delivery remains
     * waiting for assignment rather than being assigned to an arbitrary user.
     */
    @Transactional
    public void ensureForReadyOrder(Order order, UUID actorUserId) {
        if (order == null || !"DELIVERY".equals(order.getOrderType())) {
            return;
        }
        if (deliveryRepository.findByOrderId(order.getId()).isPresent()) {
            return;
        }

        RestaurantSettings settings = requireSettings(order.getRestaurantId());
        UUID configuredDriver = settings.getDefaultDeliveryDriverUserId();
        List<RestaurantMember> drivers = memberRepository.findEligibleDeliveryDrivers(order.getRestaurantId());
        UUID driverUserId = drivers.stream().map(RestaurantMember::getUserId)
                .filter(id -> id.equals(configuredDriver)).findFirst()
                .orElseGet(() -> drivers.isEmpty() ? null : drivers.getFirst().getUserId());
        if (!java.util.Objects.equals(configuredDriver, driverUserId)) {
            settings.setDefaultDeliveryDriverUserId(driverUserId);
            settingsRepository.save(settings);
        }

        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        Delivery delivery = new Delivery();
        delivery.setOrderId(order.getId());
        delivery.setDriverUserId(driverUserId);
        delivery.setAssignedByUserId(driverUserId == null ? null : actorUserId);
        delivery.setStatus(driverUserId == null ? "WAITING_ASSIGNMENT" : "ASSIGNED");
        delivery.setAssignedAt(driverUserId == null ? null : now);
        delivery = deliveryRepository.save(delivery);

        recordDeliveryStatus(delivery, actorUserId, delivery.getStatus(),
                driverUserId == null
                        ? "Delivery created; no eligible delivery driver is available."
                        : "Automatically assigned to the restaurant default driver " + driverUserId + ".");

        if (driverUserId != null) {
            createNotification(driverUserId, order, "DELIVERY_ASSIGNED",
                    "New delivery assigned",
                    "Order " + order.getOrderNumber() + " is ready for delivery.");
        }
    }

    /**
     * Keeps legacy manager order status updates consistent with delivery state.
     * Drivers can use the delivery status endpoint, which updates both records.
     */
    @Transactional
    public void synchronizeManagerOrderStatus(
            Order order, UUID actorUserId, String nextOrderStatus) {
        if (order == null || !"DELIVERY".equals(order.getOrderType())) {
            return;
        }
        boolean pickup = "OUT_FOR_DELIVERY".equals(nextOrderStatus);
        boolean delivered = "COMPLETED".equals(nextOrderStatus)
                && "OUT_FOR_DELIVERY".equals(order.getStatus());
        if (!pickup && !delivered) {
            return;
        }

        authorization.requireAuthenticatedUserMatches(actorUserId);
        authorization.requirePermission(order.getRestaurantId(), RestaurantPermission.DELIVERY_STATUS_UPDATE);
        Delivery delivery = deliveryRepository.findByOrderIdForUpdate(order.getId())
                .orElseThrow(() -> new ApiException(
                        HttpStatus.CONFLICT,
                        "DELIVERY_NOT_READY_FOR_STATUS_CHANGE",
                        "error.delivery.assignment-required"));
        requireLockedDeliveryAccess(order, delivery, actorUserId);

        if (pickup) {
            requireTransition("ASSIGNED".equals(delivery.getStatus()),
                    delivery.getStatus(), "PICKED_UP");
            delivery.setStatus("PICKED_UP");
            delivery.setPickedUpAt(OffsetDateTime.now(ZoneOffset.UTC));
            deliveryRepository.save(delivery);
            recordDeliveryStatus(delivery, actorUserId, "PICKED_UP",
                    "Marked picked up from manager order workflow.");
            notifyCustomer(order, "DELIVERY_ON_THE_WAY",
                    "Your order is on the way",
                    "Order " + order.getOrderNumber() + " is on the way.");
        } else {
            requireTransition("PICKED_UP".equals(delivery.getStatus()),
                    delivery.getStatus(), "DELIVERED");
            // This legacy manager endpoint has no cash-collected confirmation flag.
            // Pending cash-on-delivery payments must be completed through the delivery API.
            ensureNoPendingCashOnDelivery(order);
            delivery.setStatus("DELIVERED");
            delivery.setDeliveredAt(OffsetDateTime.now(ZoneOffset.UTC));
            deliveryRepository.save(delivery);
            recordDeliveryStatus(delivery, actorUserId, "DELIVERED",
                    "Marked delivered from manager order workflow.");
            notifyCustomer(order, "DELIVERY_COMPLETED", "Order delivered",
                    "Order " + order.getOrderNumber() + " has been delivered.");
        }
    }

    private void confirmCashOnDeliveryPayment(
            Order order, Boolean cashCollected, OffsetDateTime paidAt, UUID actorUserId) {
        List<Payment> payments = paymentRepository
                .findByOrderIdOrderByCreatedAtDesc(order.getId());
        List<Payment> pendingCod = payments.stream()
                .filter(payment -> "CASH_ON_DELIVERY".equals(payment.getMethod())
                        && "PENDING".equals(payment.getStatus()))
                .toList();
        if (pendingCod.isEmpty()) {
            return;
        }
        if (!Boolean.TRUE.equals(cashCollected)) {
            throw new ApiException(HttpStatus.CONFLICT,
                    "CASH_COLLECTION_REQUIRED",
                    "error.delivery.cash-collection-required");
        }
        for (Payment payment : pendingCod) {
            payment.setStatus("PAID");
            payment.setPaidAt(paidAt);
            payment.setCollectedByUserId(actorUserId);
            paymentRepository.save(payment);
        }
    }

    private void ensureNoPendingCashOnDelivery(Order order) {
        boolean pendingCod = paymentRepository
                .findByOrderIdOrderByCreatedAtDesc(order.getId())
                .stream()
                .anyMatch(payment -> "CASH_ON_DELIVERY".equals(payment.getMethod())
                        && "PENDING".equals(payment.getStatus()));
        if (pendingCod) {
            throw new ApiException(HttpStatus.CONFLICT,
                    "CASH_COLLECTION_REQUIRED",
                    "error.delivery.cash-collection-required");
        }
    }

    private String normalizeStatusFilter(String status) {
        if (status == null || status.isBlank()) {
            return null;
        }
        String normalized = status.trim();
        if (!VALID_DELIVERY_STATUSES.contains(normalized)) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "INVALID_DELIVERY_STATUS_FILTER",
                    "error.delivery.invalid-status-filter");
        }
        return normalized;
    }

    private Pageable safePageable(Pageable pageable) {
        int page = pageable == null ? 0 : Math.max(0, pageable.getPageNumber());
        int size = pageable == null ? 20
                : Math.max(1, Math.min(pageable.getPageSize(), MAX_PAGE_SIZE));
        List<Sort.Order> accepted = pageable == null ? List.of()
                : pageable.getSort().stream()
                .filter(order -> VALID_SORT_FIELDS.contains(order.getProperty()))
                .toList();
        Sort sort = accepted.isEmpty()
                ? Sort.by(Sort.Direction.DESC, "createdAt")
                : Sort.by(accepted);
        return PageRequest.of(page, size, sort);
    }

    private Order requireOrder(Delivery delivery, UUID restaurantId) {
        return orderRepository.findByIdAndRestaurantId(
                        delivery.getOrderId(), restaurantId)
                .orElseThrow(this::deliveryNotFound);
    }

    private Order lockOrderForDelivery(UUID restaurantId, UUID deliveryId) {
        // Read only the ID here so Hibernate loads the delivery state for the first time under the write lock.
        UUID orderId = deliveryRepository.findOrderIdByDeliveryIdAndRestaurantId(deliveryId, restaurantId)
                .orElseThrow(this::deliveryNotFound);
        return orderRepository.findByIdAndRestaurantIdForUpdate(orderId, restaurantId)
                .orElseThrow(this::deliveryNotFound);
    }

    private void requireLockedDeliveryAccess(Order order, Delivery delivery, UUID actorUserId) {
        if (!order.getId().equals(delivery.getOrderId())
                || (!actorUserId.equals(delivery.getDriverUserId())
                && !authorization.hasPermission(order.getRestaurantId(), RestaurantPermission.DELIVERY_ASSIGN))) {
            throw deliveryNotFound();
        }
    }

    private void requireCurrentRevision(Delivery delivery, OffsetDateTime expectedUpdatedAt) {
        if (expectedUpdatedAt != null && (delivery.getUpdatedAt() == null
                || !expectedUpdatedAt.isEqual(delivery.getUpdatedAt()))) {
            throw new ApiException(HttpStatus.CONFLICT, "STALE_DELIVERY", "error.delivery.stale");
        }
    }

    private String appendNote(String message, String note) {
        return note == null || note.isBlank() ? message : message + "\n" + note.trim();
    }

    private RestaurantSettings requireSettings(UUID restaurantId) {
        return settingsRepository.findById(restaurantId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.CONFLICT,
                        "RESTAURANT_SETTINGS_MISSING",
                        "error.restaurant.settings-missing"));
    }

    private void requireDeliveryOrder(Order order) {
        if (!"DELIVERY".equals(order.getOrderType())) {
            throw new ApiException(HttpStatus.CONFLICT,
                    "ORDER_IS_NOT_DELIVERY", "error.delivery.order-not-delivery");
        }
    }

    private void requireAssignableStatus(String status) {
        if (!List.of("WAITING_ASSIGNMENT", "ASSIGNED", "FAILED", "CANCELLED").contains(status)) {
            throw new ApiException(HttpStatus.CONFLICT,
                    "DELIVERY_CANNOT_BE_REASSIGNED",
                    "error.delivery.cannot-reassign");
        }
    }

    private void requireTransition(boolean allowed, String current, String next) {
        if (!allowed) {
            throw new ApiException(HttpStatus.CONFLICT,
                    "INVALID_DELIVERY_STATUS_TRANSITION",
                    "error.delivery.invalid-transition",
                    current, next);
        }
    }

    private void recordDeliveryStatus(
            Delivery delivery, UUID actorUserId, String status, String note) {
        DeliveryStatusHistory history = new DeliveryStatusHistory();
        history.setDeliveryId(delivery.getId());
        history.setChangedByUserId(actorUserId);
        history.setStatus(status);
        history.setNote(note);
        deliveryHistoryRepository.save(history);
    }

    private void recordOrderStatus(
            Order order, UUID actorUserId, String status, String note) {
        OrderStatusHistory history = new OrderStatusHistory();
        history.setOrderId(order.getId());
        history.setChangedByUserId(actorUserId);
        history.setStatus(status);
        history.setNote(note);
        orderHistoryRepository.save(history);
    }

    private void notifyCustomer(
            Order order, String type, String title, String body) {
        if (order.getCustomerId() == null) {
            return;
        }
        createNotification(order.getCustomerId(), order, type, title, body);
    }

    private void createNotification(
            UUID recipientUserId, Order order, String type,
            String title, String body) {
        AppNotification notification = new AppNotification();
        notification.setUserId(recipientUserId);
        notification.setOrderId(order.getId());
        notification.setNotificationType(type);
        notification.setTitle(title);
        notification.setBody(body);
        notification.setChannel("IN_APP");
        notification.setStatus("PENDING");
        notificationRepository.save(notification);
    }

    static DeliveryTaskDto toTask(Delivery delivery, Order order) {
        return new DeliveryTaskDto(
                delivery.getId(),
                order.getId(),
                order.getOrderNumber(),
                order.getStatus(),
                delivery.getStatus(),
                delivery.getDriverUserId(),
                order.getDeliveryName(),
                order.getDeliveryPhone(),
                order.getDeliveryAddress(),
                order.getDeliveryNote() == null
                        ? delivery.getDeliveryNote()
                        : order.getDeliveryNote(),
                order.getTotalAmount(),
                delivery.getAssignedAt(),
                delivery.getPickedUpAt(),
                delivery.getDeliveredAt(),
                delivery.getFailureReason(),
                delivery.getCreatedAt(),
                delivery.getUpdatedAt());
    }

    private ApiException deliveryNotFound() {
        return new ApiException(HttpStatus.NOT_FOUND,
                "DELIVERY_NOT_FOUND", "error.delivery.not-found");
    }
}
