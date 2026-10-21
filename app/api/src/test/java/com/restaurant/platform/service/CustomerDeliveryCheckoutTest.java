package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.order.CreateDeliveryOrderRequest;
import com.restaurant.platform.dto.order.CreateOrderItemRequest;
import com.restaurant.platform.entity.Restaurant;
import com.restaurant.platform.entity.RestaurantSettings;
import com.restaurant.platform.repository.*;
import com.restaurant.platform.security.RestaurantAuthorization;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

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
    private OrderService service;

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
                mock(NamedParameterJdbcTemplate.class));
    }

    @Test
    void successfulCheckoutUsesDatabasePricesAndCreatesPendingCodPayment() {
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
        when(addressRepository.findByIdAndUserId(addressId, userId))
                .thenReturn(Optional.of(address));

        com.restaurant.platform.entity.DeliveryZone zone =
                new com.restaurant.platform.entity.DeliveryZone();
        zone.setId(zoneId);
        zone.setRestaurantId(restaurantId);
        zone.setName("Nearby");
        zone.setDeliveryFee(250L);
        zone.setMinimumOrder(0L);
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
