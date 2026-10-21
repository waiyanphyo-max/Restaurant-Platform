package com.restaurant.platform.service;

import org.springframework.stereotype.Service;
import com.restaurant.platform.dto.order.*;
import com.restaurant.platform.entity.*;
import com.restaurant.platform.repository.*;
import com.restaurant.platform.security.TokenUtils;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.common.error.ApiException;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Service
public class OrderService {

    private final RestaurantRepository restaurantRepository;
    private final RestaurantSettingsRepository settingsRepository;
    private final CategoryRepository categoryRepository;
    private final ProductRepository productRepository;
    private final ProductVariantRepository variantRepository;
    private final ProductModifierGroupRepository productModifierGroupRepository;
    private final ModifierGroupRepository modifierGroupRepository;
    private final ModifierOptionRepository modifierOptionRepository;
    private final DiningTableRepository diningTableRepository;
    private final QueueTicketRepository queueTicketRepository;
    private final OrderRepository orderRepository;
    private final OrderItemRepository orderItemRepository;
    private final OrderItemModifierRepository orderItemModifierRepository;
    private final OrderStatusHistoryRepository orderStatusHistoryRepository;
    private final CustomerAddressRepository customerAddressRepository;
    private final DeliveryZoneRepository deliveryZoneRepository;
    private final ProfileRepository profileRepository;
    private final PaymentRepository paymentRepository;
    private final RestaurantAuthorization restaurantAuthorization;
    private final NamedParameterJdbcTemplate jdbc;

    public OrderService(
            RestaurantRepository restaurantRepository,
            RestaurantSettingsRepository settingsRepository,
            CategoryRepository categoryRepository,
            ProductRepository productRepository,
            ProductVariantRepository variantRepository,
            ProductModifierGroupRepository productModifierGroupRepository,
            ModifierGroupRepository modifierGroupRepository,
            ModifierOptionRepository modifierOptionRepository,
            DiningTableRepository diningTableRepository,
            QueueTicketRepository queueTicketRepository,
            OrderRepository orderRepository,
            OrderItemRepository orderItemRepository,
            OrderItemModifierRepository orderItemModifierRepository,
            OrderStatusHistoryRepository orderStatusHistoryRepository,
            CustomerAddressRepository customerAddressRepository,
            DeliveryZoneRepository deliveryZoneRepository,
            ProfileRepository profileRepository,
            PaymentRepository paymentRepository,
            RestaurantAuthorization restaurantAuthorization,
            NamedParameterJdbcTemplate jdbc) {
        this.restaurantRepository = restaurantRepository;
        this.settingsRepository = settingsRepository;
        this.categoryRepository = categoryRepository;
        this.productRepository = productRepository;
        this.variantRepository = variantRepository;
        this.productModifierGroupRepository = productModifierGroupRepository;
        this.modifierGroupRepository = modifierGroupRepository;
        this.modifierOptionRepository = modifierOptionRepository;
        this.diningTableRepository = diningTableRepository;
        this.queueTicketRepository = queueTicketRepository;
        this.orderRepository = orderRepository;
        this.orderItemRepository = orderItemRepository;
        this.orderItemModifierRepository = orderItemModifierRepository;
        this.orderStatusHistoryRepository = orderStatusHistoryRepository;
        this.customerAddressRepository = customerAddressRepository;
        this.deliveryZoneRepository = deliveryZoneRepository;
        this.profileRepository = profileRepository;
        this.paymentRepository = paymentRepository;
        this.restaurantAuthorization = restaurantAuthorization;
        this.jdbc = jdbc;
    }

    @Transactional
    public CreateOrderResponse createCommonQrOrder(
            UUID restaurantId,
            CreateQrOrderRequest request
    ) {
        return createQrOrder(restaurantId, request, true);
    }

    @Transactional
    public CreateOrderResponse createTableQrOrder(
            UUID restaurantId,
            CreateQrOrderRequest request
    ) {
        return createQrOrder(restaurantId, request, false);
    }

    @Transactional(readOnly = true)
    public List<DeliveryZoneDto> listCustomerDeliveryZones(
            UUID restaurantId, UUID userId) {
        restaurantAuthorization.requireAuthenticatedUserMatches(userId);
        restaurantRepository.findByIdAndIsActiveTrue(restaurantId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "RESTAURANT_NOT_FOUND",
                        "error.restaurant.not-found"));

        RestaurantSettings settings = settingsRepository.findById(restaurantId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.CONFLICT,
                        "RESTAURANT_SETTINGS_MISSING",
                        "error.restaurant.settings-missing"));
        if (!Boolean.TRUE.equals(settings.getAllowDelivery())) {
            throw new ApiException(HttpStatus.CONFLICT,
                    "DELIVERY_UNAVAILABLE", "error.delivery.unavailable");
        }

        return deliveryZoneRepository.findByRestaurantIdAndIsActiveTrue(restaurantId)
                .stream()
                .map(zone -> new DeliveryZoneDto(
                        zone.getId(), zone.getName(),
                        zone.getDeliveryFee(), zone.getMinimumOrder()))
                .toList();
    }

    @Transactional
    public CreateOrderResponse createDeliveryOrder(
            UUID restaurantId,
            UUID userId,
            CreateDeliveryOrderRequest request) {
        restaurantAuthorization.requireAuthenticatedUserMatches(userId);
        if (request == null || request.addressId() == null
                || request.deliveryZoneId() == null
                || request.items() == null || request.items().isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "DELIVERY_ORDER_FIELDS_REQUIRED",
                    "error.delivery.order-fields-required");
        }

        Restaurant restaurant = restaurantRepository
                .findByIdAndIsActiveTrue(restaurantId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "RESTAURANT_NOT_FOUND",
                        "error.restaurant.not-found"));
        RestaurantSettings settings = settingsRepository
                .findById(restaurantId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.CONFLICT,
                        "RESTAURANT_SETTINGS_MISSING",
                        "error.restaurant.settings-missing"));
        if (!Boolean.TRUE.equals(settings.getAcceptsOrders())
                || !Boolean.TRUE.equals(settings.getAllowDelivery())) {
            throw new ApiException(HttpStatus.CONFLICT,
                    "DELIVERY_UNAVAILABLE", "error.delivery.unavailable");
        }

        CustomerAddress address = customerAddressRepository
                .findByIdAndUserId(request.addressId(), userId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.BAD_REQUEST,
                        "INVALID_CUSTOMER_ADDRESS",
                        "error.address.not-found"));

        DeliveryZone zone = deliveryZoneRepository
                .findByIdAndRestaurantIdAndIsActiveTrue(
                        request.deliveryZoneId(), restaurantId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.BAD_REQUEST,
                        "INVALID_DELIVERY_ZONE",
                        "error.delivery.zone-not-available"));

        Profile profile = profileRepository.findById(userId).orElse(null);
        String recipientName = firstNonBlank(
                request.recipientName(),
                address.getRecipientName(),
                profile == null ? null : profile.getFullName());
        String recipientPhone = firstNonBlank(
                request.recipientPhone(),
                profile == null ? null : profile.getPhone());
        if (recipientName == null || recipientPhone == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "DELIVERY_CONTACT_REQUIRED",
                    "error.delivery.contact-required");
        }

        List<PreparedLine> lines;
        long subtotal = 0L;
        try {
            lines = request.items().stream()
                    .map(item -> prepareLine(restaurantId, item))
                    .toList();
            for (PreparedLine line : lines) {
                subtotal = Math.addExact(subtotal, line.subtotal());
            }
        } catch (ArithmeticException exception) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "ORDER_AMOUNT_TOO_LARGE", "error.order.amount-too-large");
        }

        long requiredMinimum = Math.max(
                settings.getMinimumOrder() == null ? 0L : settings.getMinimumOrder(),
                zone.getMinimumOrder() == null ? 0L : zone.getMinimumOrder());
        if (subtotal < requiredMinimum) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "MINIMUM_ORDER_NOT_MET", "error.order.minimum-not-met");
        }

        for (PreparedLine line : lines) {
            if (Boolean.TRUE.equals(line.product().getTrackStock())) {
                int changedRows = productRepository.reserveStock(
                        line.product().getId(), restaurantId, line.quantity());
                if (changedRows != 1) {
                    throw new ApiException(HttpStatus.CONFLICT,
                            "INSUFFICIENT_STOCK",
                            "error.product.insufficient-stock-name",
                            line.product().getName());
                }
            }
        }

        String paymentMethod = request.paymentMethod() == null
                || request.paymentMethod().isBlank()
                ? "CASH_ON_DELIVERY"
                : request.paymentMethod().trim().toUpperCase(Locale.ROOT);
        if (!"CASH_ON_DELIVERY".equals(paymentMethod)) {
            throw new ApiException(
                    "ONLINE".equals(paymentMethod) || "CASH_AT_COUNTER".equals(paymentMethod)
                            ? HttpStatus.CONFLICT : HttpStatus.BAD_REQUEST,
                    "PAYMENT_METHOD_NOT_AVAILABLE",
                    "error.delivery.payment-method-not-available");
        }

        long deliveryFee = zone.getDeliveryFee() == null ? 0L : zone.getDeliveryFee();
        long totalAmount;
        try {
            totalAmount = Math.addExact(subtotal, deliveryFee);
        } catch (ArithmeticException exception) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "ORDER_AMOUNT_TOO_LARGE", "error.order.amount-too-large");
        }

        ZoneId zoneId = ZoneId.of(
                settings.getTimezone() == null ? "Asia/Yangon" : settings.getTimezone());
        String orderNumber = "ORD-"
                + LocalDate.now(zoneId).format(DateTimeFormatter.BASIC_ISO_DATE)
                + "-"
                + UUID.randomUUID().toString().substring(0, 8)
                        .toUpperCase(Locale.ROOT);

        Order order = new Order();
        order.setRestaurantId(restaurantId);
        order.setOrderNumber(orderNumber);
        order.setCustomerId(userId);
        order.setCreatedByUserId(userId);
        order.setDeliveryZoneId(zone.getId());
        order.setOrderType("DELIVERY");
        order.setOrderChannel("CUSTOMER_APP");
        order.setStatus("PENDING");
        order.setSubtotal(subtotal);
        order.setDeliveryFee(deliveryFee);
        order.setDiscountAmount(0L);
        order.setTotalAmount(totalAmount);
        order.setDeliveryName(recipientName);
        order.setDeliveryPhone(recipientPhone);
        order.setDeliveryAddress(formatAddress(address));
        order.setDeliveryNote(firstNonBlank(
                request.deliveryNote(), address.getDeliveryNote()));
        order = orderRepository.saveAndFlush(order);

        for (PreparedLine line : lines) {
            OrderItem item = new OrderItem();
            item.setRestaurantId(restaurantId);
            item.setOrderId(order.getId());
            item.setProductId(line.product().getId());
            item.setVariantId(line.variant() == null ? null : line.variant().getId());
            item.setProductName(line.product().getName());
            item.setVariantName(line.variant() == null ? null : line.variant().getName());
            item.setUnitPrice(line.unitPrice());
            item.setQuantity(line.quantity());
            item.setSubtotal(line.subtotal());
            item.setSpecialInstruction(line.specialInstruction());
            item = orderItemRepository.saveAndFlush(item);

            for (PreparedModifier prepared : line.modifiers()) {
                OrderItemModifier modifier = new OrderItemModifier();
                modifier.setRestaurantId(restaurantId);
                modifier.setOrderItemId(item.getId());
                modifier.setModifierOptionId(prepared.option().getId());
                modifier.setName(prepared.option().getName());
                modifier.setAdditionalPrice(prepared.option().getAdditionalPrice());
                modifier.setQuantity(prepared.quantity());
                orderItemModifierRepository.save(modifier);
            }
        }

        OrderStatusHistory history = new OrderStatusHistory();
        history.setOrderId(order.getId());
        history.setChangedByUserId(userId);
        history.setStatus("PENDING");
        history.setNote("Order placed through authenticated customer delivery checkout.");
        orderStatusHistoryRepository.save(history);

        Payment payment = new Payment();
        payment.setOrderId(order.getId());
        payment.setMethod(paymentMethod);
        payment.setStatus("PENDING");
        payment.setAmount(totalAmount);
        paymentRepository.save(payment);

        return new CreateOrderResponse(
                order.getId(), order.getOrderNumber(), order.getOrderType(),
                order.getOrderChannel(), order.getStatus(), settings.getCurrency(),
                subtotal, deliveryFee, 0L, totalAmount, null);
    }

    private String firstNonBlank(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return null;
    }

    private String formatAddress(CustomerAddress address) {
        return java.util.stream.Stream.of(
                        address.getHouseNo(), address.getStreet(), address.getWard(),
                        address.getTownship(), address.getCity())
                .filter(value -> value != null && !value.isBlank())
                .map(String::trim)
                .collect(java.util.stream.Collectors.joining(", "));
    }

    private QueueCounter nextQueueCounter(
            UUID restaurantId,
            LocalDate queueDate
    ) {
        String sql = """
        INSERT INTO public.daily_queue_counters AS dc (
            restaurant_id,
            queue_date,
            last_number
        )
        VALUES (
            :restaurantId,
            :queueDate,
            1
        )
        ON CONFLICT (restaurant_id, queue_date)
        DO UPDATE SET
            last_number = dc.last_number + 1,
            updated_at = now()
        RETURNING id, last_number
        """;

        MapSqlParameterSource params = new MapSqlParameterSource()
                .addValue("restaurantId", restaurantId)
                .addValue("queueDate", queueDate);

        return jdbc.queryForObject(
                sql,
                params,
                (rs, rowNum) -> new QueueCounter(
                        rs.getObject("id", UUID.class),
                        rs.getInt("last_number")
                )
        );
    }

    private CreateOrderResponse createQrOrder(
            UUID restaurantId,
            CreateQrOrderRequest request,
            boolean commonQr
    ) {
        Restaurant restaurant = restaurantRepository
                .findByIdAndIsActiveTrue(restaurantId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "RESTAURANT_NOT_FOUND",
                        "error.restaurant.not-found"
                ));

        RestaurantSettings settings = settingsRepository
                .findById(restaurantId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.CONFLICT,
                        "RESTAURANT_SETTINGS_MISSING",
                        "error.restaurant.settings-missing"
                ));

        if (!Boolean.TRUE.equals(settings.getAcceptsOrders())
                || !Boolean.TRUE.equals(settings.getAllowQrOrder())) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "QR_ORDERING_DISABLED",
                    "error.restaurant.qr-ordering-disabled"
            );
        }

        if (commonQr
                && !Boolean.TRUE.equals(settings.getAllowTakeaway())) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "TAKEAWAY_UNAVAILABLE",
                    "error.order.takeaway-unavailable"
            );
        }

        DiningTable table = null;

        if (commonQr) {
            if (!secureEquals(
                    settings.getCommonQrToken(),
                    request.qrToken()
            )) {
                throw new ApiException(
                        HttpStatus.FORBIDDEN,
                        "INVALID_COMMON_QR_TOKEN",
                        "error.qr.invalid-common-token"
                );
            }
        } else {
            table = diningTableRepository
                    .findByRestaurantIdAndQrTokenAndIsActiveTrue(
                            restaurantId,
                            request.qrToken()
                    )
                    .orElseThrow(() -> new ApiException(
                            HttpStatus.FORBIDDEN,
                            "INVALID_TABLE_QR_TOKEN",
                            "error.qr.invalid-table-token"
                    ));
        }

        List<PreparedLine> lines = request.items().stream()
                .map(item -> prepareLine(restaurantId, item))
                .toList();

        long subtotal = 0L;

        try {
            for (PreparedLine line : lines) {
                subtotal = Math.addExact(subtotal, line.subtotal());
            }
        } catch (ArithmeticException ex) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "ORDER_AMOUNT_TOO_LARGE",
                    "error.order.amount-too-large"
            );
        }

        if (subtotal < settings.getMinimumOrder()) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "MINIMUM_ORDER_NOT_MET",
                    "error.order.minimum-not-met"
            );
        }

        // Stock reservation is part of this transaction.
        for (PreparedLine line : lines) {
            if (line.product().getTrackStock()) {
                int changedRows = productRepository.reserveStock(
                        line.product().getId(),
                        restaurantId,
                        line.quantity()
                );

                if (changedRows != 1) {
                    throw new ApiException(
                            HttpStatus.CONFLICT,
                            "INSUFFICIENT_STOCK",
                            "error.product.insufficient-stock-name",
                            line.product().getName()
                    );
                }
            }
        }

        ZoneId zone = ZoneId.of(
                settings.getTimezone() == null
                        ? "Asia/Yangon"
                        : settings.getTimezone()
        );

        LocalDate queueDate = LocalDate.now(zone);

        QueueTicket ticket = null;
        String rawTrackingToken = null;

        if (commonQr) {
            QueueCounter counter = nextQueueCounter(
                    restaurantId,
                    queueDate
            );

            rawTrackingToken = TokenUtils.generateToken();

            ticket = new QueueTicket();
            ticket.setRestaurantId(restaurantId);
            ticket.setDailyCounterId(counter.id());
            ticket.setQueueNumber(counter.lastNumber());
            ticket.setDisplayCode(
                    String.format("%03d", counter.lastNumber())
            );
            ticket.setStatus("WAITING");
            ticket.setPublicTokenHash(
                    TokenUtils.sha256(rawTrackingToken)
            );

            ticket = queueTicketRepository.saveAndFlush(ticket);
        }

        String orderNumber = "ORD-"
                + LocalDate.now(zone)
                .format(DateTimeFormatter.BASIC_ISO_DATE)
                + "-"
                + UUID.randomUUID()
                .toString()
                .substring(0, 8)
                .toUpperCase(Locale.ROOT);

        Order order = new Order();
        order.setRestaurantId(restaurantId);
        order.setOrderNumber(orderNumber);
        order.setOrderType(commonQr ? "TAKEAWAY" : "DINE_IN");
        order.setOrderChannel(commonQr ? "COMMON_QR" : "TABLE_QR");
        order.setStatus("PENDING");
        order.setSubtotal(subtotal);
        order.setDeliveryFee(0L);
        order.setDiscountAmount(0L);
        order.setTotalAmount(subtotal);

        if (table != null) {
            order.setTableId(table.getId());
        }

        if (ticket != null) {
            order.setQueueTicketId(ticket.getId());
        }

        order = orderRepository.saveAndFlush(order);

        for (PreparedLine line : lines) {
            OrderItem item = new OrderItem();
            item.setRestaurantId(restaurantId);
            item.setOrderId(order.getId());
            item.setProductId(line.product().getId());

            item.setVariantId(
                    line.variant() == null
                            ? null
                            : line.variant().getId()
            );

            item.setProductName(line.product().getName());

            item.setVariantName(
                    line.variant() == null
                            ? null
                            : line.variant().getName()
            );

            // The base selling price is stored here.
            // Modifier prices are snapshotted separately.
            item.setUnitPrice(line.unitPrice());
            item.setQuantity(line.quantity());
            item.setSubtotal(line.subtotal());
            item.setSpecialInstruction(line.specialInstruction());

            item = orderItemRepository.saveAndFlush(item);

            for (PreparedModifier prepared : line.modifiers()) {
                OrderItemModifier modifier = new OrderItemModifier();
                modifier.setRestaurantId(restaurantId);
                modifier.setOrderItemId(item.getId());
                modifier.setModifierOptionId(prepared.option().getId());
                modifier.setName(prepared.option().getName());
                modifier.setAdditionalPrice(
                        prepared.option().getAdditionalPrice()
                );
                modifier.setQuantity(prepared.quantity());

                orderItemModifierRepository.save(modifier);
            }
        }

        OrderStatusHistory history = new OrderStatusHistory();
        history.setOrderId(order.getId());
        history.setStatus("PENDING");
        history.setNote(
                commonQr
                        ? "Order placed via COMMON_QR"
                        : "Order placed via TABLE_QR"
        );

        orderStatusHistoryRepository.save(history);

        CreateOrderResponse.QueueInfo queueInfo = null;

        if (ticket != null) {
            queueInfo = new CreateOrderResponse.QueueInfo(
                    ticket.getId(),
                    ticket.getQueueNumber(),
                    ticket.getDisplayCode(),
                    ticket.getStatus(),
                    rawTrackingToken
            );
        }

        return new CreateOrderResponse(
                order.getId(),
                order.getOrderNumber(),
                order.getOrderType(),
                order.getOrderChannel(),
                order.getStatus(),
                settings.getCurrency(),
                subtotal,
                0L,
                0L,
                subtotal,
                queueInfo
        );
    }

    private boolean secureEquals(String expected, String actual) {
        if (expected == null || actual == null) {
            return false;
        }

        return MessageDigest.isEqual(
                expected.getBytes(StandardCharsets.UTF_8),
                actual.getBytes(StandardCharsets.UTF_8)
        );
    }

    private record QueueCounter(UUID id, int lastNumber) {}

    private record PreparedModifier(
            ModifierOption option,
            int quantity
    ) {}

    private record PreparedLine(
            Product product,
            ProductVariant variant,
            int quantity,
            long unitPrice,
            long subtotal,
            String specialInstruction,
            List<PreparedModifier> modifiers
    ) {}

    private PreparedLine prepareLine(
            UUID restaurantId,
            CreateOrderItemRequest request
    ) {
        Product product = productRepository
                .findByIdAndRestaurantId(
                        request.productId(),
                        restaurantId
                )
                .orElseThrow(() -> new ApiException(
                        HttpStatus.BAD_REQUEST,
                        "INVALID_PRODUCT",
                        "error.product.invalid"
                ));

        if (!Boolean.TRUE.equals(product.getIsAvailable())) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "PRODUCT_UNAVAILABLE",
                    "error.product.unavailable"
            );
        }

        categoryRepository
                .findByIdAndRestaurantIdAndIsActiveTrue(
                        product.getCategoryId(),
                        restaurantId
                )
                .orElseThrow(() -> new ApiException(
                        HttpStatus.CONFLICT,
                        "PRODUCT_CATEGORY_INACTIVE",
                        "error.product.category-inactive"
                ));

        if (product.getTrackStock()
                && (product.getStockQuantity() == null
                || product.getStockQuantity() < request.quantity())) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "INSUFFICIENT_STOCK",
                    "error.product.insufficient-stock"
            );
        }

        List<ProductVariant> allVariants =
                variantRepository.findByProductId(product.getId());

        ProductVariant selectedVariant = null;

        if (!allVariants.isEmpty()) {
            if (request.variantId() == null) {
                throw new ApiException(
                        HttpStatus.BAD_REQUEST,
                        "PRODUCT_VARIANT_REQUIRED",
                        "error.product.variant-required"
                );
            }

            selectedVariant = variantRepository
                    .findByIdAndProductId(
                            request.variantId(),
                            product.getId()
                    )
                    .filter(v -> Boolean.TRUE.equals(v.getIsAvailable()))
                    .orElseThrow(() -> new ApiException(
                            HttpStatus.BAD_REQUEST,
                            "INVALID_PRODUCT_VARIANT",
                            "error.product.variant-unavailable"
                    ));

        } else if (request.variantId() != null) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "VARIANT_NOT_APPLICABLE",
                    "error.product.variant-not-applicable"
            );
        }

        long unitPrice = selectedVariant == null
                ? product.getPrice()
                : selectedVariant.getPrice();

        List<UUID> allowedGroupIds =
                productModifierGroupRepository
                        .findModifierGroupIdsByProductIdAndRestaurantId(
                                product.getId(),
                                restaurantId
                        );

        List<ModifierSelectionRequest> selections =
                request.modifiers() == null
                        ? List.of()
                        : request.modifiers();

        Set<UUID> selectedOptionIds = new HashSet<>();
        Map<UUID, Integer> selectedCountByGroup = new HashMap<>();
        List<PreparedModifier> preparedModifiers = new ArrayList<>();

        long modifierExtraPerServing = 0L;

        for (ModifierSelectionRequest selection : selections) {
            if (!selectedOptionIds.add(selection.modifierOptionId())) {
                throw new ApiException(
                        HttpStatus.BAD_REQUEST,
                        "DUPLICATE_MODIFIER_OPTION",
                        "error.modifier.duplicate-option"
                );
            }

            ModifierOption option = modifierOptionRepository
                    .findByIdAndRestaurantIdAndIsAvailableTrue(
                            selection.modifierOptionId(),
                            restaurantId
                    )
                    .orElseThrow(() -> new ApiException(
                            HttpStatus.BAD_REQUEST,
                            "INVALID_MODIFIER_OPTION",
                            "error.modifier.option-unavailable"
                    ));

            UUID groupId = option.getModifierGroupId();

            if (!allowedGroupIds.contains(groupId)) {
                throw new ApiException(
                        HttpStatus.BAD_REQUEST,
                        "MODIFIER_NOT_ALLOWED_FOR_PRODUCT",
                        "error.modifier.not-allowed-for-product"
                );
            }

            modifierGroupRepository
                    .findByIdAndRestaurantIdAndIsActiveTrue(
                            groupId,
                            restaurantId
                    )
                    .orElseThrow(() -> new ApiException(
                            HttpStatus.CONFLICT,
                            "MODIFIER_GROUP_INACTIVE",
                            "error.modifier.group-inactive"
                    ));

            // min/max selections count selected options, not modifier units.
            selectedCountByGroup.merge(groupId, 1, Integer::sum);

            modifierExtraPerServing = Math.addExact(
                    modifierExtraPerServing,
                    Math.multiplyExact(
                            option.getAdditionalPrice(),
                            (long) selection.quantity()
                    )
            );

            preparedModifiers.add(
                    new PreparedModifier(option, selection.quantity())
            );
        }

        // Check each attached active modifier group's min/max rules.
        for (UUID groupId : allowedGroupIds) {
            var optionalGroup = modifierGroupRepository
                    .findByIdAndRestaurantIdAndIsActiveTrue(
                            groupId,
                            restaurantId
                    );

            if (optionalGroup.isEmpty()) {
                continue;
            }

            ModifierGroup group = optionalGroup.get();

            int selectedCount = selectedCountByGroup.getOrDefault(
                    groupId,
                    0
            );

            if (selectedCount < group.getMinSelections()
                    || selectedCount > group.getMaxSelections()) {
                throw new ApiException(
                        HttpStatus.BAD_REQUEST,
                        "INVALID_MODIFIER_SELECTION_COUNT",
                        "error.modifier.selection-count-invalid",
                        group.getName()
                );
            }
        }

        long itemSubtotal;

        try {
            long pricePerServing = Math.addExact(
                    unitPrice,
                    modifierExtraPerServing
            );

            itemSubtotal = Math.multiplyExact(
                    pricePerServing,
                    request.quantity()
            );

        } catch (ArithmeticException ex) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "ORDER_AMOUNT_TOO_LARGE",
                    "error.order.amount-too-large"
            );
        }

        return new PreparedLine(
                product,
                selectedVariant,
                request.quantity(),
                unitPrice,
                itemSubtotal,
                request.specialInstruction(),
                List.copyOf(preparedModifiers)
        );
    }
}