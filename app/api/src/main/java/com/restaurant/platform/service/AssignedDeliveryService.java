package com.restaurant.platform.service;

import com.restaurant.platform.common.GeoCoordinates;
import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.delivery.AssignedDeliveryDetailDto;
import com.restaurant.platform.entity.Delivery;
import com.restaurant.platform.entity.Order;
import com.restaurant.platform.entity.Restaurant;
import com.restaurant.platform.repository.DeliveryRepository;
import com.restaurant.platform.repository.OrderItemRepository;
import com.restaurant.platform.repository.OrderRepository;
import com.restaurant.platform.repository.PaymentRepository;
import com.restaurant.platform.repository.RestaurantRepository;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.security.RestaurantPermission;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@Service
@RequiredArgsConstructor
public class AssignedDeliveryService {
    private final RestaurantAuthorization authorization;
    private final DeliveryRepository deliveryRepository;
    private final OrderRepository orderRepository;
    private final RestaurantRepository restaurantRepository;
    private final OrderItemRepository orderItemRepository;
    private final PaymentRepository paymentRepository;

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public AssignedDeliveryDetailDto getDetail(UUID restaurantId, UUID deliveryId) {
        UUID userId = authorization.requireAuthenticatedUserId();
        authorization.requirePermission(restaurantId, RestaurantPermission.DELIVERY_READ);
        Delivery delivery = deliveryRepository
                .findByIdAndRestaurantIdAndDriverUserId(deliveryId, restaurantId, userId)
                .orElseThrow(AssignedDeliveryService::deliveryNotFound);
        Order order = orderRepository.findByIdAndRestaurantId(delivery.getOrderId(), restaurantId)
                .filter(candidate -> "DELIVERY".equals(candidate.getOrderType()))
                .orElseThrow(AssignedDeliveryService::deliveryNotFound);
        Restaurant restaurant = restaurantRepository.findById(restaurantId)
                .orElseThrow(AssignedDeliveryService::deliveryNotFound);

        GeoCoordinates pickup = new GeoCoordinates(restaurant.getLatitude(), restaurant.getLongitude());
        GeoCoordinates destination = new GeoCoordinates(order.getDeliveryLatitude(), order.getDeliveryLongitude());
        List<AssignedDeliveryDetailDto.Item> items = orderItemRepository
                .findByOrderIdAndRestaurantIdOrderByCreatedAtAsc(order.getId(), restaurantId)
                .stream()
                .map(item -> new AssignedDeliveryDetailDto.Item(item.getId(), item.getProductName(),
                        item.getVariantName(), item.getQuantity(), item.getSpecialInstruction()))
                .toList();
        boolean cashCollectionRequired = paymentRepository
                .existsByOrderIdAndMethodAndStatus(order.getId(), "CASH_ON_DELIVERY", "PENDING");

        return new AssignedDeliveryDetailDto(DeliveryService.toTask(delivery, order),
                new AssignedDeliveryDetailDto.Pickup(restaurant.getName(), pickupAddress(restaurant),
                        pickup.latitude(), pickup.longitude()),
                destination, items, cashCollectionRequired);
    }

    private static String pickupAddress(Restaurant restaurant) {
        if (restaurant.getAddress() != null && !restaurant.getAddress().isBlank()) {
            return restaurant.getAddress().trim();
        }
        String address = Stream.of(restaurant.getHouseNo(), restaurant.getStreet(), restaurant.getWard(),
                        restaurant.getTownship(), restaurant.getCity())
                .filter(value -> value != null && !value.isBlank())
                .map(String::trim)
                .collect(Collectors.joining(", "));
        return address.isEmpty() ? null : address;
    }

    private static ApiException deliveryNotFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "DELIVERY_NOT_FOUND", "error.delivery.not-found");
    }
}
