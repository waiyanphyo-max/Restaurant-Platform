package com.restaurant.platform.service;

import com.restaurant.platform.accounting.AccountingSupport;
import com.restaurant.platform.common.GeoCoordinates;
import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.order.CreateOrderItemRequest;
import com.restaurant.platform.dto.order.CreateOrderResponse;
import com.restaurant.platform.dto.order.CustomerDeliveryCheckoutRequest;
import com.restaurant.platform.dto.order.CustomerDeliveryQuote;
import com.restaurant.platform.entity.CustomerAddress;
import com.restaurant.platform.entity.DeliveryZone;
import com.restaurant.platform.entity.Order;
import com.restaurant.platform.entity.Profile;
import com.restaurant.platform.repository.CustomerAddressRepository;
import com.restaurant.platform.repository.DeliveryZoneRepository;
import com.restaurant.platform.repository.OrderRepository;
import com.restaurant.platform.repository.ProfileRepository;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.security.TokenUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static com.restaurant.platform.service.OrderService.firstNonBlank;
import static com.restaurant.platform.service.OrderService.formatAddress;

@Service
@RequiredArgsConstructor
public class CustomerDeliveryCheckoutService {
    private static final String CASH_ON_DELIVERY = "CASH_ON_DELIVERY";
    private static final BigDecimal HALF_COORDINATE_UNIT = new BigDecimal("0.00000005");

    private final RestaurantAuthorization authorization;
    private final OrderService orders;
    private final OrderRepository orderRepository;
    private final CustomerAddressRepository addressRepository;
    private final ProfileRepository profileRepository;
    private final DeliveryZoneRepository zoneRepository;
    private final AccountingSupport accounting;
    private final CustomerOrderNotifications notifications;
    private final JsonMapper json;

    @Transactional(readOnly = true)
    public CustomerDeliveryQuote quote(UUID restaurantId, UUID userId, CustomerDeliveryCheckoutRequest request) {
        authorization.requireAuthenticatedUserMatches(userId);
        return review(restaurantId, userId, UUID.randomUUID(), request).quote();
    }

    @Transactional
    public CreateOrderResponse checkout(UUID restaurantId, UUID userId, String rawKey,
                                        CustomerDeliveryCheckoutRequest request) {
        authorization.requireAuthenticatedUserMatches(userId);
        UUID key = checkoutKey(rawKey);
        if (request.confirmationToken() == null) {
            throw quoteChanged();
        }
        String requestHash = digest(request);

        // The shared tenant lock serializes concurrent retries and preserves the existing accounting lock order.
        accounting.lock(restaurantId);
        Optional<Order> existing = findOrder(restaurantId, userId, key);
        if (existing.isPresent()) {
            Order order = existing.get();
            if (!requestHash.equals(order.getDeliveryCheckoutRequestHash())) {
                throw new ApiException(HttpStatus.CONFLICT, "IDEMPOTENCY_KEY_REUSED", "error.idempotency.key-reused");
            }
            return receipt(order);
        }

        Review current = review(restaurantId, userId, key, request);
        if (!current.quote().confirmationToken().equals(request.confirmationToken())) {
            throw quoteChanged();
        }
        Order order = orders.saveDeliveryOrder(restaurantId, userId, current.plan(),
                current.quote().destination(), key, requestHash);
        notifications.orderCreated(order);
        return receipt(order);
    }

    @Transactional
    public Optional<CreateOrderResponse> getReceipt(UUID restaurantId, UUID userId, String rawKey) {
        authorization.requireAuthenticatedUserMatches(userId);
        UUID key = checkoutKey(rawKey);
        accounting.lock(restaurantId);
        return findOrder(restaurantId, userId, key).map(CustomerDeliveryCheckoutService::receipt);
    }

    private Optional<Order> findOrder(UUID restaurantId, UUID userId, UUID key) {
        return orderRepository.findByRestaurantIdAndCustomerIdAndDeliveryCheckoutKey(restaurantId, userId, key);
    }

    private static CreateOrderResponse receipt(Order order) {
        return OrderService.deliveryReceipt(order, order.getDeliveryCheckoutCurrency());
    }

    private Review review(UUID restaurantId, UUID userId, UUID key, CustomerDeliveryCheckoutRequest request) {
        var restaurant = orders.requireActiveRestaurant(restaurantId);
        var settings = orders.requireDeliverySettings(restaurantId);
        var destination = resolveDestination(userId, request);
        var zones = coveringZones(restaurantId, destination);
        var cart = orders.prepareDeliveryCart(restaurantId, request.items());
        var zone = zones.stream().filter(candidate -> cart.subtotal() >= candidate.getMinimumOrder())
                .findFirst().orElse(zones.getFirst());
        var plan = orders.prepareDelivery(settings, zone, cart);
        var lines = plan.quoteLines();
        var version = new QuoteVersion(restaurantId, restaurant.getName(), userId, key, zone.getId(),
                settings.getCurrency(), plan.deliveryFee(), destination, lines, request.items());
        var quote = new CustomerDeliveryQuote(restaurantId, restaurant.getName(), settings.getCurrency(),
                plan.subtotal(), plan.deliveryFee(), 0L, plan.totalAmount(), CASH_ON_DELIVERY,
                destination, lines, digest(version), key);
        return new Review(plan, quote);
    }

    private CustomerDeliveryQuote.Destination resolveDestination(UUID userId, CustomerDeliveryCheckoutRequest request) {
        if ((request.addressId() == null) == (request.temporaryDestination() == null)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "DELIVERY_DESTINATION_REQUIRED",
                    "error.delivery.destination-required");
        }
        Profile profile = profileRepository.findById(userId).orElse(null);
        if (request.addressId() != null) {
            CustomerAddress saved = addressRepository.findByIdAndUserId(request.addressId(), userId)
                    .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST,
                            "INVALID_CUSTOMER_ADDRESS", "error.address.not-found"));
            String streetAddress = firstNonBlank(saved.getHouseNo(), saved.getStreet(), saved.getWard());
            return destination("SAVED_ADDRESS", saved.getId(), streetAddress == null ? null : formatAddress(saved),
                    saved.getCity(), saved.getTownship(), saved.getLatitude(), saved.getLongitude(),
                    firstNonBlank(request.recipientName(), saved.getRecipientName(), profileName(profile)),
                    firstNonBlank(request.recipientPhone(), profilePhone(profile)),
                    request.deliveryNote() == null ? saved.getDeliveryNote() : request.deliveryNote());
        }

        var temporary = request.temporaryDestination();
        return destination(temporary.source().name(), null, temporary.address(), temporary.city(),
                temporary.township(), temporary.latitude(), temporary.longitude(),
                firstNonBlank(request.recipientName(), profileName(profile)),
                firstNonBlank(request.recipientPhone(), profilePhone(profile)), request.deliveryNote());
    }

    private static String profileName(Profile profile) {
        return profile == null ? null : profile.getFullName();
    }

    private static String profilePhone(Profile profile) {
        return profile == null ? null : profile.getPhone();
    }

    private static CustomerDeliveryQuote.Destination destination(
            String source, UUID addressId, String address, String city, String township,
            BigDecimal latitude, BigDecimal longitude, String name, String phone, String note) {
        var point = new GeoCoordinates(latitude, longitude);
        if (point.latitude() == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "DELIVERY_COORDINATES_REQUIRED",
                    "error.delivery.coordinates-required");
        }
        if (firstNonBlank(address) == null || firstNonBlank(city) == null || firstNonBlank(township) == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "DELIVERY_ADDRESS_LOCATION_REQUIRED",
                    "error.delivery.destination-address-required");
        }
        if (name == null || phone == null || name.length() > 150 || phone.length() > 30) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "DELIVERY_CONTACT_REQUIRED", "error.delivery.contact-required");
        }

        String fullAddress = addressId == null
                ? String.join(", ", address.trim(), township.trim(), city.trim()) : address.trim();
        return new CustomerDeliveryQuote.Destination(source, addressId, fullAddress, city.trim(), township.trim(),
                storedCoordinate(point.latitude()), storedCoordinate(point.longitude()), name, phone, firstNonBlank(note));
    }

    private static BigDecimal storedCoordinate(BigDecimal coordinate) {
        return coordinate.abs().compareTo(HALF_COORDINATE_UNIT) < 0
                ? BigDecimal.ZERO : coordinate.setScale(7, RoundingMode.HALF_UP).stripTrailingZeros();
    }

    private List<DeliveryZone> coveringZones(UUID restaurantId, CustomerDeliveryQuote.Destination destination) {
        var zones = zoneRepository.findByRestaurantIdAndIsActiveTrue(restaurantId).stream()
                .filter(zone -> OrderService.deliveryZoneCovers(zone, destination.city(), destination.township()))
                .sorted(Comparator.comparing((DeliveryZone zone) -> zone.getCoverageCity() == null)
                        .thenComparingLong(DeliveryZone::getDeliveryFee)
                        .thenComparingLong(DeliveryZone::getMinimumOrder)
                        .thenComparing(DeliveryZone::getId))
                .toList();
        if (zones.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "DELIVERY_ADDRESS_OUTSIDE_ZONE",
                    "error.delivery.destination-outside-zone");
        }
        // Unrestricted legacy zones remain the fallback where no specific coverage is configured.
        return zones.getFirst().getCoverageCity() == null ? zones
                : zones.stream().filter(zone -> zone.getCoverageCity() != null).toList();
    }

    private String digest(Object value) {
        return TokenUtils.sha256(json.writeValueAsString(value));
    }

    private static UUID checkoutKey(String rawKey) {
        try {
            UUID key = UUID.fromString(rawKey);
            if (key.toString().equalsIgnoreCase(rawKey)) {
                return key;
            }
        } catch (IllegalArgumentException | NullPointerException ignored) {
            // The caller receives one validation error for missing and malformed keys.
        }
        throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_IDEMPOTENCY_KEY", "error.idempotency.invalid-key");
    }

    private static ApiException quoteChanged() {
        return new ApiException(HttpStatus.CONFLICT, "DELIVERY_QUOTE_CHANGED", "error.delivery.quote-changed");
    }

    private record Review(OrderService.DeliveryPlan plan, CustomerDeliveryQuote quote) {}

    private record QuoteVersion(UUID restaurantId, String restaurantName, UUID userId, UUID key, UUID zoneId,
                                String currency, long deliveryFee, CustomerDeliveryQuote.Destination destination,
                                List<CustomerDeliveryQuote.Line> lines, List<CreateOrderItemRequest> items) {}
}
