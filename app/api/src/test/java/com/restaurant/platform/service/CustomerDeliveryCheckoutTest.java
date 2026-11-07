package com.restaurant.platform.service;

import com.restaurant.platform.accounting.AccountingSupport;
import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.order.CreateDeliveryOrderRequest;
import com.restaurant.platform.dto.order.CreateOrderItemRequest;
import com.restaurant.platform.dto.order.CustomerDeliveryCheckoutRequest;
import com.restaurant.platform.dto.order.CustomerDeliveryCheckoutRequest.TemporaryDestination;
import com.restaurant.platform.dto.order.CustomerDeliveryCheckoutRequest.TemporarySource;
import com.restaurant.platform.dto.order.CustomerDeliveryQuote;
import com.restaurant.platform.entity.*;
import com.restaurant.platform.repository.*;
import com.restaurant.platform.security.RestaurantAuthorization;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class CustomerDeliveryCheckoutTest {

    private RestaurantRepository restaurantRepository;
    private RestaurantSettingsRepository settingsRepository;
    private CategoryRepository categoryRepository;
    private ProductRepository productRepository;
    private ProductVariantRepository variantRepository;
    private ProductModifierGroupRepository productModifierGroupRepository;
    private ModifierGroupRepository modifierGroupRepository;
    private ModifierOptionRepository modifierOptionRepository;
    private DiningTableRepository diningTableRepository;
    private QueueTicketRepository queueTicketRepository;
    private OrderRepository orderRepository;
    private OrderItemRepository orderItemRepository;
    private OrderItemModifierRepository orderItemModifierRepository;
    private OrderStatusHistoryRepository orderStatusHistoryRepository;
    private CustomerAddressRepository addressRepository;
    private DeliveryZoneRepository zoneRepository;
    private ProfileRepository profileRepository;
    private PaymentRepository paymentRepository;
    private RestaurantAuthorization authorization;
    private QrOrderIdempotencyService qrOrderIdempotencyService;
    private OrderService service;
    private CustomerDeliveryCheckoutService checkout;
    private CustomerOrderNotifications notifications;
    private AccountingSupport accounting;

    private final UUID restaurantId = UUID.randomUUID();
    private final UUID userId = UUID.randomUUID();
    private final UUID addressId = UUID.randomUUID();
    private final UUID zoneId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        restaurantRepository = mock(RestaurantRepository.class);
        settingsRepository = mock(RestaurantSettingsRepository.class);
        categoryRepository = mock(CategoryRepository.class);
        productRepository = mock(ProductRepository.class);
        variantRepository = mock(ProductVariantRepository.class);
        productModifierGroupRepository = mock(ProductModifierGroupRepository.class);
        modifierGroupRepository = mock(ModifierGroupRepository.class);
        modifierOptionRepository = mock(ModifierOptionRepository.class);
        diningTableRepository = mock(DiningTableRepository.class);
        queueTicketRepository = mock(QueueTicketRepository.class);
        orderRepository = mock(OrderRepository.class);
        orderItemRepository = mock(OrderItemRepository.class);
        orderItemModifierRepository = mock(OrderItemModifierRepository.class);
        orderStatusHistoryRepository = mock(OrderStatusHistoryRepository.class);
        addressRepository = mock(CustomerAddressRepository.class);
        zoneRepository = mock(DeliveryZoneRepository.class);
        profileRepository = mock(ProfileRepository.class);
        paymentRepository = mock(PaymentRepository.class);
        authorization = mock(RestaurantAuthorization.class);
        qrOrderIdempotencyService = mock(QrOrderIdempotencyService.class);
        service = new OrderService(
                restaurantRepository,
                settingsRepository,
                categoryRepository,
                productRepository,
                variantRepository,
                productModifierGroupRepository,
                modifierGroupRepository,
                modifierOptionRepository,
                diningTableRepository,
                queueTicketRepository,
                orderRepository,
                orderItemRepository,
                orderItemModifierRepository,
                orderStatusHistoryRepository,
                addressRepository,
                zoneRepository,
                profileRepository,
                paymentRepository,
                authorization,
                mock(NamedParameterJdbcTemplate.class),
                qrOrderIdempotencyService);
        notifications = mock(CustomerOrderNotifications.class);
        accounting = mock(AccountingSupport.class);
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        var activeKeys = new HashMap<List<UUID>, UUID>();
        when(jdbc.query(contains("SELECT checkout_key"), org.mockito.ArgumentMatchers.<RowMapper<UUID>>any(),
                any(UUID.class), any(UUID.class))).thenAnswer(invocation -> Optional.ofNullable(activeKeys.get(
                        List.of(invocation.getArgument(2), invocation.getArgument(3)))).stream().toList());
        when(jdbc.update(contains("INSERT INTO public.customer_delivery_checkout_keys"), any(UUID.class),
                any(UUID.class), any(UUID.class))).thenAnswer(invocation -> {
                    activeKeys.put(List.of(invocation.getArgument(1), invocation.getArgument(2)), invocation.getArgument(3));
                    return 1;
                });
        when(jdbc.update(contains("DELETE FROM public.customer_delivery_checkout_keys"), any(UUID.class),
                any(UUID.class), any(UUID.class))).thenAnswer(invocation -> activeKeys.remove(
                        List.of(invocation.getArgument(1), invocation.getArgument(2)), invocation.getArgument(3)) ? 1 : 0);
        checkout = new CustomerDeliveryCheckoutService(authorization, service, orderRepository,
                addressRepository, profileRepository, zoneRepository, accounting, notifications,
                JsonMapper.builder().build(), jdbc);
    }

    @ParameterizedTest
    @CsvSource({"MANUAL_MAP", "GPS_CONFIRMED"})
    void temporaryDestinationCheckoutPersistsConfirmedPointAndReplaysOnlyOnce(TemporarySource source) {
        Product product = givenOrderableProduct();
        var request = temporaryRequest(source, "Tamwe", new BigDecimal("16.123456789"), product);
        var quote = checkout.quote(restaurantId, userId, request);
        assertEquals(2250L, quote.totalAmount());
        assertEquals(2000L, quote.lines().getFirst().subtotal());
        assertEquals(new BigDecimal("16.1234568"), quote.destination().latitude());
        assertEquals(BigDecimal.ZERO, quote.destination().longitude());
        var confirmed = confirm(request, quote);

        var original = checkout.checkout(restaurantId, userId, quote.idempotencyKey().toString(), confirmed);
        var order = org.mockito.ArgumentCaptor.forClass(Order.class);
        verify(orderRepository).saveAndFlush(order.capture());
        assertEquals("PENDING", original.status());
        assertEquals(quote.totalAmount(), original.totalAmount());
        assertEquals(source.name(), order.getValue().getDeliveryLocationSource());
        assertEquals(quote.destination().latitude(), order.getValue().getDeliveryLatitude());
        assertEquals("Friend's house, Garden Road, Tamwe, Yangon", order.getValue().getDeliveryAddress());
        assertEquals("Tamwe", order.getValue().getDeliveryTownship());
        assertEquals("Yangon", order.getValue().getDeliveryCity());
        assertEquals("Blue gate", order.getValue().getDeliveryNote());
        assertNull(order.getValue().getDeliveryAddressId());

        var payment = org.mockito.ArgumentCaptor.forClass(Payment.class);
        verify(paymentRepository).save(payment.capture());
        assertEquals("CASH_ON_DELIVERY", payment.getValue().getMethod());
        assertEquals("PENDING", payment.getValue().getStatus());
        assertEquals(quote.totalAmount(), payment.getValue().getAmount());

        when(orderRepository.findByRestaurantIdAndCustomerIdAndDeliveryCheckoutKey(restaurantId, userId, quote.idempotencyKey()))
                .thenReturn(Optional.of(order.getValue()));
        product.setPrice(5000L);
        order.getValue().setStatus("ACCEPTED");
        assertEquals(original, checkout.checkout(restaurantId, userId, quote.idempotencyKey().toString(), confirmed));
        assertEquals(original, checkout.getReceipt(restaurantId, userId, quote.idempotencyKey().toString()).orElseThrow());
        assertEquals(original, checkout.abandon(restaurantId, userId, quote.idempotencyKey().toString()).orElseThrow());
        assertTrue(checkout.getReceipt(restaurantId, UUID.randomUUID(), quote.idempotencyKey().toString()).isEmpty());
        assertTrue(checkout.getReceipt(UUID.randomUUID(), userId, quote.idempotencyKey().toString()).isEmpty());
        var changed = confirm(temporaryRequest(source, "Different township", BigDecimal.ZERO, product), quote);
        assertCheckoutError("IDEMPOTENCY_KEY_REUSED", quote, changed);
        verify(orderRepository, times(1)).saveAndFlush(any());
        verify(notifications).orderCreated(order.getValue());
        verifyNoInteractions(addressRepository);
    }

    @Test
    void quoteRejectsInvalidRecipientPhoneAndSnapshotsTheNormalizedNumber() {
        var draft = temporaryRequest(TemporarySource.MANUAL_MAP, "Tamwe", BigDecimal.ZERO, givenOrderableProduct());
        var invalid = new CustomerDeliveryCheckoutRequest(null, draft.temporaryDestination(), draft.recipientName(),
                "call-me", draft.deliveryNote(), draft.items(), null);
        assertQuoteError("INVALID_DELIVERY_PHONE", invalid);

        var formatted = new CustomerDeliveryCheckoutRequest(null, draft.temporaryDestination(), draft.recipientName(),
                "၀၉ ၉၄၂-၁၂၃-၄၅၆", draft.deliveryNote(), draft.items(), null);
        var quote = checkout.quote(restaurantId, userId, formatted);
        assertEquals("+959942123456", quote.destination().recipientPhone());
        checkout.checkout(restaurantId, userId, quote.idempotencyKey().toString(), confirm(formatted, quote));
        verify(orderRepository).saveAndFlush(argThat(order -> "+959942123456".equals(order.getDeliveryPhone())));
    }

    @Test
    void savedAddressCheckoutRevalidatesEditsAndSnapshotsOnlyOwnedAddress() {
        Product product = givenOrderableProduct();
        CustomerAddress saved = new CustomerAddress();
        saved.setId(addressId);
        saved.setUserId(userId);
        saved.setStreet("Original street");
        saved.setTownship("Tamwe");
        saved.setCity("Yangon");
        saved.setRecipientName("Saved recipient");
        saved.setDeliveryNote("Original instructions");
        saved.setLatitude(BigDecimal.valueOf(16));
        saved.setLongitude(BigDecimal.valueOf(96));
        saved.setIsDefault(true);
        when(addressRepository.findByIdAndUserId(addressId, userId)).thenReturn(Optional.of(saved));
        var request = new CustomerDeliveryCheckoutRequest(addressId, null, null, "09123456", null,
                List.of(new CreateOrderItemRequest(product.getId(), null, 1, null, List.of())), null);
        var stale = checkout.quote(restaurantId, userId, request);
        saved.setLatitude(BigDecimal.valueOf(17));
        assertCheckoutError("DELIVERY_QUOTE_CHANGED", stale, confirm(request, stale));
        verify(orderRepository, never()).saveAndFlush(any());

        var current = checkout.quote(restaurantId, userId, request);
        assertEquals("Saved recipient", current.destination().recipientName());
        checkout.checkout(restaurantId, userId, current.idempotencyKey().toString(), confirm(request, current));
        var order = org.mockito.ArgumentCaptor.forClass(Order.class);
        verify(orderRepository).saveAndFlush(order.capture());

        saved.setStreet("Changed street");
        saved.setLatitude(BigDecimal.TEN);
        saved.setIsDefault(false);
        assertEquals("SAVED_ADDRESS", order.getValue().getDeliveryLocationSource());
        assertEquals(addressId, order.getValue().getDeliveryAddressId());
        assertEquals("Original street, Tamwe, Yangon", order.getValue().getDeliveryAddress());
        assertEquals("Original instructions", order.getValue().getDeliveryNote());
        assertEquals(BigDecimal.valueOf(17), order.getValue().getDeliveryLatitude());
        verify(addressRepository, never()).save(any());
        ApiException error = assertThrows(ApiException.class, () -> checkout.quote(restaurantId, UUID.randomUUID(), request));
        assertEquals("INVALID_CUSTOMER_ADDRESS", error.getCode());
    }

    @Test
    void changedPriceOrFeeRequiresAnotherReviewBeforeAnyOrderIsWritten() {
        Product product = givenOrderableProduct();
        var request = temporaryRequest(TemporarySource.MANUAL_MAP, "Tamwe", BigDecimal.ZERO, product);
        var quote = checkout.quote(restaurantId, userId, request);
        product.setPrice(1100L);
        assertCheckoutError("DELIVERY_QUOTE_CHANGED", quote, confirm(request, quote));
        var updatedPrice = checkout.quote(restaurantId, userId, request);
        assertEquals(2450L, updatedPrice.totalAmount());
        zoneRepository.findByRestaurantIdAndIsActiveTrue(restaurantId).getFirst().setDeliveryFee(300L);
        assertCheckoutError("DELIVERY_QUOTE_CHANGED", updatedPrice, confirm(request, updatedPrice));
        assertEquals(2500L, checkout.quote(restaurantId, userId, request).totalAmount());
        verify(orderRepository, never()).saveAndFlush(any());
        verifyNoInteractions(paymentRepository, notifications);
    }

    @Test
    void missingConfirmationAndMismatchedKeyCannotPlaceOrder() {
        Product product = givenOrderableProduct();
        var request = temporaryRequest(TemporarySource.MANUAL_MAP, "Tamwe", BigDecimal.ZERO, product);
        var quote = checkout.quote(restaurantId, userId, request);
        assertCheckoutError("DELIVERY_QUOTE_CHANGED", quote, request);
        var wrongKey = assertThrows(ApiException.class, () -> checkout.checkout(restaurantId, userId,
                UUID.randomUUID().toString(), confirm(request, quote)));
        assertEquals("DELIVERY_QUOTE_CHANGED", wrongKey.getCode());
        var invalidKey = assertThrows(ApiException.class,
                () -> checkout.checkout(restaurantId, userId, "1-1-1-1-1", confirm(request, quote)));
        assertEquals("INVALID_IDEMPOTENCY_KEY", invalidKey.getCode());
        verify(orderRepository, never()).saveAndFlush(any());
    }

    @Test
    void quoteRejectsInvalidOrUnsupportedDestinationAndOutOfStock() {
        Product product = givenOrderableProduct();
        assertQuoteError("DELIVERY_ADDRESS_OUTSIDE_ZONE",
                temporaryRequest(TemporarySource.MANUAL_MAP, "Other township", BigDecimal.ZERO, product));
        assertQuoteError("DELIVERY_COORDINATES_REQUIRED",
                temporaryRequest(TemporarySource.GPS_CONFIRMED, "Tamwe", BigDecimal.valueOf(91), product));
        assertQuoteError("DELIVERY_COORDINATES_REQUIRED",
                temporaryRequest(TemporarySource.GPS_CONFIRMED, "Tamwe", null, product));
        assertQuoteError("DELIVERY_ADDRESS_LOCATION_REQUIRED",
                temporaryRequest(TemporarySource.MANUAL_MAP, " ", BigDecimal.ZERO, product));
        product.setTrackStock(true);
        product.setStockQuantity(1);
        assertQuoteError("INSUFFICIENT_STOCK",
                temporaryRequest(TemporarySource.MANUAL_MAP, "Tamwe", BigDecimal.ZERO, product));
        verifyNoInteractions(orderRepository, paymentRepository, notifications);
    }

    @Test
    void quoteValidatesStockAcrossCartLinesAndBothDeliveryMinimums() {
        Product product = givenOrderableProduct();
        product.setTrackStock(true);
        product.setStockQuantity(3);
        var oneLine = temporaryRequest(TemporarySource.MANUAL_MAP, "Tamwe", BigDecimal.ZERO, product);
        var duplicate = new CustomerDeliveryCheckoutRequest(null, oneLine.temporaryDestination(),
                oneLine.recipientName(), oneLine.recipientPhone(), null,
                List.of(oneLine.items().getFirst(), oneLine.items().getFirst()), null);
        assertQuoteError("INSUFFICIENT_STOCK", duplicate);
        var settings = settingsRepository.findById(restaurantId).orElseThrow();
        settings.setMinimumOrder(2001L);
        assertQuoteError("MINIMUM_ORDER_NOT_MET", oneLine);
        settings.setMinimumOrder(0L);
        zoneRepository.findByRestaurantIdAndIsActiveTrue(restaurantId).getFirst().setMinimumOrder(2001L);
        assertQuoteError("MINIMUM_ORDER_NOT_MET", oneLine);
    }

    @Test
    void quoteChoosesTheLowestFeeForAnEligibleSpecificZoneBeforeAnUnrestrictedFallback() {
        Product product = givenOrderableProduct();
        var cheaper = zoneRepository.findByRestaurantIdAndIsActiveTrue(restaurantId).getFirst();
        cheaper.setMinimumOrder(2001L);
        var eligible = new DeliveryZone();
        eligible.setId(UUID.randomUUID());
        eligible.setCoverageCity(" yangon ");
        eligible.setCoverageTownship("TAMWE");
        eligible.setDeliveryFee(300L);
        var fallback = new DeliveryZone();
        fallback.setId(UUID.randomUUID());
        fallback.setDeliveryFee(50L);
        when(zoneRepository.findByRestaurantIdAndIsActiveTrue(restaurantId)).thenReturn(List.of(cheaper, fallback, eligible));

        assertEquals(300L, checkout.quote(restaurantId, userId,
                temporaryRequest(TemporarySource.MANUAL_MAP, "Tamwe", BigDecimal.ZERO, product)).deliveryFee());
        assertEquals(50L, checkout.quote(restaurantId, userId,
                temporaryRequest(TemporarySource.MANUAL_MAP, "Different township", BigDecimal.ZERO, product)).deliveryFee());
    }

    @Test
    void quoteAndConfirmationCannotBeMovedToAnotherRestaurantOrCustomer() {
        Product product = givenOrderableProduct();
        var request = temporaryRequest(TemporarySource.MANUAL_MAP, "Tamwe", BigDecimal.ZERO, product);
        var quote = checkout.quote(restaurantId, userId, request);
        UUID otherRestaurant = UUID.randomUUID();
        var error = assertThrows(ApiException.class, () -> checkout.checkout(otherRestaurant, userId,
                quote.idempotencyKey().toString(), confirm(request, quote)));
        assertEquals("DELIVERY_QUOTE_CHANGED", error.getCode());
        var wrongCustomer = assertThrows(ApiException.class, () -> checkout.checkout(restaurantId, UUID.randomUUID(),
                quote.idempotencyKey().toString(), confirm(request, quote)));
        assertEquals("DELIVERY_QUOTE_CHANGED", wrongCustomer.getCode());
        verify(orderRepository, never()).saveAndFlush(any());
    }

    @Test
    void retiringAnUnrecordedKeyPreventsLateSubmitAfterAnotherQuote() {
        Product product = givenOrderableProduct();
        var request = temporaryRequest(TemporarySource.MANUAL_MAP, "Tamwe", BigDecimal.ZERO, product);
        var first = checkout.quote(restaurantId, userId, request);
        assertEquals(first.idempotencyKey(), checkout.quote(restaurantId, userId, request).idempotencyKey());

        String retired = first.idempotencyKey().toString();
        assertTrue(checkout.abandon(restaurantId, userId, retired).isEmpty());
        var replacement = checkout.quote(restaurantId, userId, request);
        assertNotEquals(first.idempotencyKey(), replacement.idempotencyKey());
        assertTrue(checkout.abandon(restaurantId, userId, retired).isEmpty());
        assertCheckoutError("DELIVERY_QUOTE_CHANGED", first, confirm(request, first));

        checkout.checkout(restaurantId, userId, replacement.idempotencyKey().toString(), confirm(request, replacement));
        verify(orderRepository, times(1)).saveAndFlush(any());
    }

    private Product givenOrderableProduct() {
        Restaurant restaurant = new Restaurant();
        restaurant.setName("Fixture restaurant");
        when(restaurantRepository.findByIdAndIsActiveTrue(restaurantId)).thenReturn(Optional.of(restaurant));
        when(settingsRepository.findById(restaurantId)).thenReturn(Optional.of(new RestaurantSettings()));
        DeliveryZone zone = new DeliveryZone();
        zone.setId(zoneId);
        zone.setCoverageCity("Yangon");
        zone.setCoverageTownship("Tamwe");
        zone.setDeliveryFee(250L);
        when(zoneRepository.findByRestaurantIdAndIsActiveTrue(restaurantId)).thenReturn(List.of(zone));

        Product product = new Product();
        product.setId(UUID.randomUUID());
        product.setCategoryId(UUID.randomUUID());
        product.setName("Tea");
        product.setPrice(1000L);
        product.setIsAvailable(true);
        product.setTrackStock(false);
        when(productRepository.findByIdAndRestaurantId(product.getId(), restaurantId)).thenReturn(Optional.of(product));
        when(categoryRepository.findByIdAndRestaurantIdAndIsActiveTrue(product.getCategoryId(), restaurantId))
                .thenReturn(Optional.of(new Category()));
        when(orderRepository.saveAndFlush(any(Order.class))).thenAnswer(invocation -> {
            Order order = invocation.getArgument(0);
            order.setId(UUID.randomUUID());
            return order;
        });
        when(orderItemRepository.saveAndFlush(any(OrderItem.class))).thenAnswer(invocation -> {
            OrderItem item = invocation.getArgument(0);
            item.setId(UUID.randomUUID());
            return item;
        });
        return product;
    }

    private CustomerDeliveryCheckoutRequest temporaryRequest(TemporarySource source, String township,
                                                             BigDecimal latitude, Product product) {
        return new CustomerDeliveryCheckoutRequest(null, new TemporaryDestination(source,
                "Friend's house, Garden Road", "Yangon", township, latitude, BigDecimal.ZERO),
                "Recipient", "09123456", "Blue gate",
                List.of(new CreateOrderItemRequest(product.getId(), null, 2, null, List.of())), null);
    }

    private CustomerDeliveryCheckoutRequest confirm(CustomerDeliveryCheckoutRequest request, CustomerDeliveryQuote quote) {
        return new CustomerDeliveryCheckoutRequest(request.addressId(), request.temporaryDestination(),
                request.recipientName(), request.recipientPhone(), request.deliveryNote(), request.items(), quote.confirmationToken());
    }

    private void assertCheckoutError(String code, CustomerDeliveryQuote quote, CustomerDeliveryCheckoutRequest request) {
        var error = assertThrows(ApiException.class, () -> checkout.checkout(restaurantId, userId,
                quote.idempotencyKey().toString(), request));
        assertEquals(code, error.getCode());
    }

    private void assertQuoteError(String code, CustomerDeliveryCheckoutRequest request) {
        var error = assertThrows(ApiException.class, () -> checkout.quote(restaurantId, userId, request));
        assertEquals(code, error.getCode());
    }

    @Test
    void checkoutRejectsAddressOutsideConfiguredCityAndTownship() {
        when(restaurantRepository.findByIdAndIsActiveTrue(restaurantId))
                .thenReturn(Optional.of(new Restaurant()));
        RestaurantSettings settings = new RestaurantSettings();
        settings.setRestaurantId(restaurantId);
        settings.setAcceptsOrders(true);
        settings.setAllowDelivery(true);
        when(settingsRepository.findById(restaurantId)).thenReturn(Optional.of(settings));

        com.restaurant.platform.entity.CustomerAddress address =
                new com.restaurant.platform.entity.CustomerAddress();
        address.setId(addressId);
        address.setUserId(userId);
        address.setCity("Yangon");
        address.setTownship("Tamwe");
        when(addressRepository.findByIdAndUserId(addressId, userId))
                .thenReturn(Optional.of(address));

        com.restaurant.platform.entity.DeliveryZone zone =
                new com.restaurant.platform.entity.DeliveryZone();
        zone.setId(zoneId);
        zone.setRestaurantId(restaurantId);
        zone.setName("Hlaing");
        zone.setCoverageCity("Yangon");
        zone.setCoverageTownship("Hlaing");
        when(zoneRepository.findByIdAndRestaurantIdAndIsActiveTrue(zoneId, restaurantId))
                .thenReturn(Optional.of(zone));

        CreateDeliveryOrderRequest request = new CreateDeliveryOrderRequest(
                addressId, zoneId, "Customer", "0912345678",
                null, "CASH_ON_DELIVERY",
                List.of(new CreateOrderItemRequest(UUID.randomUUID(), null, 1, null, List.of())));

        ApiException error = assertThrows(ApiException.class,
                () -> service.createDeliveryOrder(restaurantId, userId, request));

        assertEquals(HttpStatus.BAD_REQUEST, error.getStatus());
        assertEquals("DELIVERY_ADDRESS_OUTSIDE_ZONE", error.getCode());
        verifyNoInteractions(productRepository, orderRepository, paymentRepository);
    }

    @Test
    void checkoutRequiresCityAndTownshipWhenZoneHasCoverageConfigured() {
        when(restaurantRepository.findByIdAndIsActiveTrue(restaurantId))
                .thenReturn(Optional.of(new Restaurant()));
        RestaurantSettings settings = new RestaurantSettings();
        settings.setRestaurantId(restaurantId);
        settings.setAcceptsOrders(true);
        settings.setAllowDelivery(true);
        when(settingsRepository.findById(restaurantId)).thenReturn(Optional.of(settings));

        com.restaurant.platform.entity.CustomerAddress address =
                new com.restaurant.platform.entity.CustomerAddress();
        address.setId(addressId);
        address.setUserId(userId);
        address.setCity("Yangon");
        address.setTownship(" ");
        when(addressRepository.findByIdAndUserId(addressId, userId))
                .thenReturn(Optional.of(address));

        com.restaurant.platform.entity.DeliveryZone zone =
                new com.restaurant.platform.entity.DeliveryZone();
        zone.setId(zoneId);
        zone.setRestaurantId(restaurantId);
        zone.setName("Tamwe");
        zone.setCoverageCity("Yangon");
        zone.setCoverageTownship("Tamwe");
        when(zoneRepository.findByIdAndRestaurantIdAndIsActiveTrue(zoneId, restaurantId))
                .thenReturn(Optional.of(zone));

        CreateDeliveryOrderRequest request = new CreateDeliveryOrderRequest(
                addressId, zoneId, "Customer", "0912345678",
                null, "CASH_ON_DELIVERY",
                List.of(new CreateOrderItemRequest(UUID.randomUUID(), null, 1, null, List.of())));

        ApiException error = assertThrows(ApiException.class,
                () -> service.createDeliveryOrder(restaurantId, userId, request));

        assertEquals(HttpStatus.BAD_REQUEST, error.getStatus());
        assertEquals("DELIVERY_ADDRESS_LOCATION_REQUIRED", error.getCode());
        verifyNoInteractions(productRepository, orderRepository, paymentRepository);
    }

    @ParameterizedTest
    @CsvSource({"0, 96.125, 0, 96.125", "16, , , ", "91, 96, , ", ", , , "})
    void successfulCheckoutSnapshotsSelectedAddressAndCreatesPendingCodPayment(
            BigDecimal latitude, BigDecimal longitude, BigDecimal expectedLatitude, BigDecimal expectedLongitude) {
        Restaurant restaurant = new Restaurant();
        when(restaurantRepository.findByIdAndIsActiveTrue(restaurantId))
                .thenReturn(Optional.of(restaurant));
        RestaurantSettings settings = new RestaurantSettings();
        settings.setRestaurantId(restaurantId);
        settings.setCurrency("MMK");
        settings.setMinimumOrder(0L);
        settings.setAcceptsOrders(true);
        settings.setAllowDelivery(true);
        when(settingsRepository.findById(restaurantId)).thenReturn(Optional.of(settings));

        com.restaurant.platform.entity.CustomerAddress address =
                new com.restaurant.platform.entity.CustomerAddress();
        address.setId(addressId);
        address.setUserId(userId);
        address.setHouseNo("12");
        address.setStreet("Main Road");
        address.setTownship("Township");
        address.setCity("City");
        address.setLatitude(latitude);
        address.setLongitude(longitude);
        when(addressRepository.findByIdAndUserId(addressId, userId))
                .thenReturn(Optional.of(address));

        com.restaurant.platform.entity.DeliveryZone zone =
                new com.restaurant.platform.entity.DeliveryZone();
        zone.setId(zoneId);
        zone.setRestaurantId(restaurantId);
        zone.setName("Nearby");
        zone.setDeliveryFee(250L);
        zone.setMinimumOrder(0L);
        zone.setCoverageCity("City");
        zone.setCoverageTownship("Township");
        when(zoneRepository.findByIdAndRestaurantIdAndIsActiveTrue(zoneId, restaurantId))
                .thenReturn(Optional.of(zone));

        UUID productId = UUID.randomUUID();
        UUID categoryId = UUID.randomUUID();
        com.restaurant.platform.entity.Product product =
                new com.restaurant.platform.entity.Product();
        product.setId(productId);
        product.setRestaurantId(restaurantId);
        product.setCategoryId(categoryId);
        product.setName("Tea");
        product.setPrice(1000L);
        product.setIsAvailable(true);
        product.setTrackStock(false);
        when(productRepository.findByIdAndRestaurantId(productId, restaurantId))
                .thenReturn(Optional.of(product));

        com.restaurant.platform.entity.Category category =
                new com.restaurant.platform.entity.Category();
        category.setId(categoryId);
        category.setRestaurantId(restaurantId);
        category.setIsActive(true);
        when(categoryRepository.findByIdAndRestaurantIdAndIsActiveTrue(categoryId, restaurantId))
                .thenReturn(Optional.of(category));
        when(variantRepository.findByProductId(productId)).thenReturn(List.of());
        when(productModifierGroupRepository.findModifierGroupIdsByProductIdAndRestaurantId(
                productId, restaurantId)).thenReturn(List.of());

        when(orderRepository.saveAndFlush(any(com.restaurant.platform.entity.Order.class)))
                .thenAnswer(invocation -> {
                    com.restaurant.platform.entity.Order saved = invocation.getArgument(0);
                    saved.setId(UUID.randomUUID());
                    return saved;
                });
        when(orderItemRepository.saveAndFlush(any(com.restaurant.platform.entity.OrderItem.class)))
                .thenAnswer(invocation -> {
                    com.restaurant.platform.entity.OrderItem saved = invocation.getArgument(0);
                    saved.setId(UUID.randomUUID());
                    return saved;
                });

        CreateDeliveryOrderRequest request = new CreateDeliveryOrderRequest(
                addressId, zoneId, "Customer", "0912345678",
                "Ring bell", "CASH_ON_DELIVERY",
                List.of(new CreateOrderItemRequest(productId, null, 2, null, List.of())));

        var response = service.createDeliveryOrder(restaurantId, userId, request);

        assertEquals("DELIVERY", response.orderType());
        assertEquals("CUSTOMER_APP", response.orderChannel());
        assertEquals("PENDING", response.status());
        assertEquals(2000L, response.subtotal());
        assertEquals(250L, response.deliveryFee());
        assertEquals(2250L, response.totalAmount());
        assertEquals("MMK", response.currency());

        var orderCaptor = org.mockito.ArgumentCaptor.forClass(
                com.restaurant.platform.entity.Order.class);
        verify(orderRepository).saveAndFlush(orderCaptor.capture());
        var savedOrder = orderCaptor.getValue();
        address.setLatitude(BigDecimal.TEN);
        address.setLongitude(BigDecimal.TEN);
        assertEquals(expectedLatitude, savedOrder.getDeliveryLatitude());
        assertEquals(expectedLongitude, savedOrder.getDeliveryLongitude());
        assertEquals(userId, savedOrder.getCustomerId());
        assertEquals(userId, savedOrder.getCreatedByUserId());
        assertEquals(zoneId, savedOrder.getDeliveryZoneId());
        assertEquals("12, Main Road, Township, City", savedOrder.getDeliveryAddress());
        assertEquals("Ring bell", savedOrder.getDeliveryNote());

        var paymentCaptor = org.mockito.ArgumentCaptor.forClass(
                com.restaurant.platform.entity.Payment.class);
        verify(paymentRepository).save(paymentCaptor.capture());
        assertEquals("CASH_ON_DELIVERY", paymentCaptor.getValue().getMethod());
        assertEquals("PENDING", paymentCaptor.getValue().getStatus());
        assertEquals(2250L, paymentCaptor.getValue().getAmount());
        verify(orderStatusHistoryRepository).save(any(
                com.restaurant.platform.entity.OrderStatusHistory.class));
    }

    @Test
    void checkoutRejectsAddressNotOwnedByAuthenticatedCustomer() {
        when(restaurantRepository.findByIdAndIsActiveTrue(restaurantId))
                .thenReturn(Optional.of(new Restaurant()));
        RestaurantSettings settings = new RestaurantSettings();
        settings.setAcceptsOrders(true);
        settings.setAllowDelivery(true);
        when(settingsRepository.findById(restaurantId)).thenReturn(Optional.of(settings));
        when(addressRepository.findByIdAndUserId(addressId, userId)).thenReturn(Optional.empty());

        CreateDeliveryOrderRequest request = new CreateDeliveryOrderRequest(
                addressId, zoneId, "Customer", "0912345678",
                null, "CASH_ON_DELIVERY",
                List.of(new CreateOrderItemRequest(UUID.randomUUID(), null, 1, null, List.of())));

        ApiException error = assertThrows(ApiException.class,
                () -> service.createDeliveryOrder(restaurantId, userId, request));

        assertEquals("INVALID_CUSTOMER_ADDRESS", error.getCode());
        assertEquals(HttpStatus.BAD_REQUEST, error.getStatus());
        verify(zoneRepository, never()).findByIdAndRestaurantIdAndIsActiveTrue(any(), any());
        verify(orderRepository, never()).saveAndFlush(any());
    }

    @Test
    void checkoutRejectsDeliveryZoneFromAnotherRestaurantOrInactiveZone() {
        when(restaurantRepository.findByIdAndIsActiveTrue(restaurantId))
                .thenReturn(Optional.of(new Restaurant()));
        RestaurantSettings settings = new RestaurantSettings();
        settings.setAcceptsOrders(true);
        settings.setAllowDelivery(true);
        when(settingsRepository.findById(restaurantId)).thenReturn(Optional.of(settings));
        com.restaurant.platform.entity.CustomerAddress address =
                new com.restaurant.platform.entity.CustomerAddress();
        address.setId(addressId);
        address.setUserId(userId);
        address.setTownship("Township");
        address.setCity("City");
        when(addressRepository.findByIdAndUserId(addressId, userId)).thenReturn(Optional.of(address));
        when(zoneRepository.findByIdAndRestaurantIdAndIsActiveTrue(zoneId, restaurantId))
                .thenReturn(Optional.empty());

        CreateDeliveryOrderRequest request = new CreateDeliveryOrderRequest(
                addressId, zoneId, "Customer", "0912345678",
                null, "CASH_ON_DELIVERY",
                List.of(new CreateOrderItemRequest(UUID.randomUUID(), null, 1, null, List.of())));

        ApiException error = assertThrows(ApiException.class,
                () -> service.createDeliveryOrder(restaurantId, userId, request));

        assertEquals("INVALID_DELIVERY_ZONE", error.getCode());
        verify(orderRepository, never()).saveAndFlush(any());
    }

    @Test
    void checkoutRejectsWhenRestaurantHasTurnedDeliveryOff() {
        when(restaurantRepository.findByIdAndIsActiveTrue(restaurantId))
                .thenReturn(Optional.of(new Restaurant()));
        RestaurantSettings settings = new RestaurantSettings();
        settings.setAcceptsOrders(true);
        settings.setAllowDelivery(false);
        when(settingsRepository.findById(restaurantId)).thenReturn(Optional.of(settings));

        CreateDeliveryOrderRequest request = new CreateDeliveryOrderRequest(
                addressId, zoneId, "Customer", "0912345678",
                null, "CASH_ON_DELIVERY",
                List.of(new CreateOrderItemRequest(UUID.randomUUID(), null, 1, null, List.of())));

        ApiException error = assertThrows(ApiException.class,
                () -> service.createDeliveryOrder(restaurantId, userId, request));

        assertEquals("DELIVERY_UNAVAILABLE", error.getCode());
        verify(addressRepository, never()).findByIdAndUserId(any(), any());
    }
}
