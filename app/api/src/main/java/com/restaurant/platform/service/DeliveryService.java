package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.delivery.AssignDeliveryDriverRequest;
import com.restaurant.platform.dto.delivery.DefaultDeliveryDriverResponse;
import com.restaurant.platform.dto.delivery.DeliveryTaskDto;
import com.restaurant.platform.dto.delivery.UpdateDeliveryStatusRequest;
import com.restaurant.platform.entity.AppNotification;
import com.restaurant.platform.entity.Delivery;
import com.restaurant.platform.entity.DeliveryStatusHistory;
import com.restaurant.platform.entity.Order;
import com.restaurant.platform.entity.OrderStatusHistory;
import com.restaurant.platform.entity.RestaurantMember;
import com.restaurant.platform.entity.RestaurantSettings;
import com.restaurant.platform.repository.AppNotificationRepository;
import com.restaurant.platform.repository.DeliveryRepository;
import com.restaurant.platform.repository.DeliveryStatusHistoryRepository;
import com.restaurant.platform.repository.OrderRepository;
import com.restaurant.platform.repository.OrderStatusHistoryRepository;
import com.restaurant.platform.repository.RestaurantMemberRepository;
import com.restaurant.platform.repository.RestaurantSettingsRepository;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.security.RestaurantPermission;
import com.restaurant.platform.security.RestaurantRole;

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
    private final RestaurantSettingsRepository settingsRepository;
    private final RestaurantMemberRepository memberRepository;
    private final AppNotificationRepository notificationRepository;
    private final RestaurantAuthorization authorization;

    public DeliveryService(
            DeliveryRepository deliveryRepository,
            DeliveryStatusHistoryRepository deliveryHistoryRepository,
            OrderRepository orderRepository,
            OrderStatusHistoryRepository orderHistoryRepository,
            RestaurantSettingsRepository settingsRepository,
            RestaurantMemberRepository memberRepository,
            AppNotificationRepository notificationRepository,
            RestaurantAuthorization authorization) {
        this.deliveryRepository = deliveryRepository;
        this.deliveryHistoryRepository = deliveryHistoryRepository;
        this.orderRepository = orderRepository;
        this.orderHistoryRepository = orderHistoryRepository;
        this.settingsRepository = settingsRepository;
        this.memberRepository = memberRepository;
        this.notificationRepository = notificationRepository;
        this.authorization = authorization;
    }

    @PreAuthorize("@restaurantAuthorization.hasPermission(#p0, T(com.restaurant.platform.security.RestaurantPermission).DELIVERY_READ)")
    @Transactional(readOnly = true)
    public Page<DeliveryTaskDto> listRestaurantDeliveries(
            UUID restaurantId, String status, Pageable pageable) {
        authorization.requirePermission(restaurantId, RestaurantPermission.DELIVERY_READ);
        String normalizedStatus = normalizeStatusFilter(status);
        Pageable safePageable = safePageable(pageable);
        return deliveryRepository
                .findPageByRestaurantIdAndOptionalStatus(
                        restaurantId, normalizedStatus, safePageable)
                .map(delivery -> toTask(delivery, requireOrder(delivery, restaurantId)));
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
        authorization.requireDeliveryAccess(restaurantId, deliveryId);
        Delivery delivery = deliveryRepository.findById(deliveryId)
                .orElseThrow(this::deliveryNotFound);
        Order order = requireOrder(delivery, restaurantId);
        return toTask(delivery, order);
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

        // Lock order first, then delivery. All workflow writes use this lock order.
        Delivery probe = deliveryRepository.findById(deliveryId)
                .orElseThrow(this::deliveryNotFound);
        Order order = orderRepository.findByIdAndRestaurantIdForUpdate(
                        probe.getOrderId(), restaurantId)
                .orElseThrow(this::deliveryNotFound);
        Delivery delivery = deliveryRepository.findByIdForUpdate(deliveryId)
                .orElseThrow(this::deliveryNotFound);
        requireDeliveryOrder(order);
        requireAssignableStatus(delivery.getStatus());

        RestaurantMember driver = memberRepository
                .findByRestaurantIdAndUserId(restaurantId, request.driverUserId())
                .filter(member -> member.getRole() == RestaurantRole.DELIVERY_DRIVER)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.BAD_REQUEST,
                        "INVALID_DELIVERY_DRIVER",
                        "error.delivery.driver-not-member"));

        if ("FAILED".equals(delivery.getStatus())
                && "OUT_FOR_DELIVERY".equals(order.getStatus())) {
            order.setStatus("READY");
            orderRepository.save(order);
            recordOrderStatus(order, actorUserId, "READY",
                    "Delivery reassigned after a failed attempt.");
        }

        delivery.setDriverUserId(driver.getUserId());
        delivery.setAssignedByUserId(actorUserId);
        delivery.setAssignedAt(OffsetDateTime.now(ZoneOffset.UTC));
        delivery.setPickedUpAt(null);
        delivery.setDeliveredAt(null);
        delivery.setFailureReason(null);
        delivery.setStatus("ASSIGNED");
        deliveryRepository.save(delivery);
        recordDeliveryStatus(delivery, actorUserId, "ASSIGNED",
                request.note() == null || request.note().isBlank()
                        ? "Driver assigned by restaurant staff."
                        : request.note().trim());
        createNotification(driver.getUserId(), order, "DELIVERY_ASSIGNED",
                "New delivery assigned",
                "Order " + order.getOrderNumber() + " is ready for delivery.");
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

        // Lock order first, then delivery so the order and delivery statuses stay consistent.
        Delivery probe = deliveryRepository.findById(deliveryId)
                .orElseThrow(this::deliveryNotFound);
        Order order = orderRepository.findByIdAndRestaurantIdForUpdate(
                        probe.getOrderId(), restaurantId)
                .orElseThrow(this::deliveryNotFound);
        Delivery delivery = deliveryRepository.findByIdForUpdate(deliveryId)
                .orElseThrow(this::deliveryNotFound);
        authorization.requireDeliveryAccess(restaurantId, deliveryId);
        requireDeliveryOrder(order);

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
                        "ASSIGNED".equals(currentStatus) || "PICKED_UP".equals(currentStatus),
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
                        "WAITING_ASSIGNMENT".equals(currentStatus)
                                || "ASSIGNED".equals(currentStatus),
                        currentStatus, nextStatus);
                delivery.setStatus("CANCELLED");
            }
            default -> throw new ApiException(HttpStatus.BAD_REQUEST,
                    "INVALID_DELIVERY_STATUS", "error.delivery.invalid-status");
        }

        deliveryRepository.save(delivery);
        String note = request.note() == null || request.note().isBlank()
                ? request.failureReason()
                : request.note().trim();
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
        memberRepository.findByRestaurantIdAndUserId(restaurantId, driverUserId)
                .filter(member -> member.getRole() == RestaurantRole.DELIVERY_DRIVER)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.BAD_REQUEST,
                        "INVALID_DELIVERY_DRIVER",
                        "error.delivery.driver-not-member"));

        RestaurantSettings settings = requireSettings(restaurantId);
        settings.setDefaultDeliveryDriverUserId(driverUserId);
        settingsRepository.save(settings);
        return new DefaultDeliveryDriverResponse(restaurantId, driverUserId);
    }

    /**
     * Called when a delivery order becomes READY. If no default is configured,
     * the earliest-added DELIVERY_DRIVER member is selected and saved as the
     * restaurant's default. With no registered driver, the delivery remains
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
        UUID driverUserId = validConfiguredDriver(
                order.getRestaurantId(), settings.getDefaultDeliveryDriverUserId());

        if (driverUserId == null) {
            List<RestaurantMember> drivers =
                    memberRepository.findByRestaurantIdAndRoleOrderByCreatedAtAsc(
                            order.getRestaurantId(), RestaurantRole.DELIVERY_DRIVER);
            if (!drivers.isEmpty()) {
                driverUserId = drivers.getFirst().getUserId();
            }
            if (!java.util.Objects.equals(
                    settings.getDefaultDeliveryDriverUserId(), driverUserId)) {
                settings.setDefaultDeliveryDriverUserId(driverUserId);
                settingsRepository.save(settings);
            }
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
                        ? "Delivery created; no delivery driver is registered yet."
                        : "Automatically assigned to the restaurant default driver.");

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

        Delivery probe = deliveryRepository.findByOrderId(order.getId())
                .orElseThrow(() -> new ApiException(
                        HttpStatus.CONFLICT,
                        "DELIVERY_NOT_READY_FOR_STATUS_CHANGE",
                        "error.delivery.assignment-required"));
        Delivery delivery = deliveryRepository.findByIdForUpdate(probe.getId())
                .orElseThrow(this::deliveryNotFound);

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
            delivery.setStatus("DELIVERED");
            delivery.setDeliveredAt(OffsetDateTime.now(ZoneOffset.UTC));
            deliveryRepository.save(delivery);
            recordDeliveryStatus(delivery, actorUserId, "DELIVERED",
                    "Marked delivered from manager order workflow.");
            notifyCustomer(order, "DELIVERY_COMPLETED", "Order delivered",
                    "Order " + order.getOrderNumber() + " has been delivered.");
        }
    }

    private UUID validConfiguredDriver(UUID restaurantId, UUID configuredDriverId) {
        if (configuredDriverId == null) {
            return null;
        }
        return memberRepository.findByRestaurantIdAndUserId(
                        restaurantId, configuredDriverId)
                .filter(member -> member.getRole() == RestaurantRole.DELIVERY_DRIVER)
                .map(RestaurantMember::getUserId)
                .orElse(null);
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
        if (!List.of("WAITING_ASSIGNMENT", "ASSIGNED", "FAILED").contains(status)) {
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

    private DeliveryTaskDto toTask(Delivery delivery, Order order) {
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
