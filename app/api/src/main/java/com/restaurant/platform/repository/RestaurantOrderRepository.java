package com.restaurant.platform.repository;

import com.restaurant.platform.entity.RestaurantOrder;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
import java.util.List;

/** Spring Data repository for orders. */
public interface RestaurantOrderRepository extends JpaRepository<RestaurantOrder, UUID> {
    List<RestaurantOrder> findByRestaurantIdOrderByCreatedAtDesc(UUID restaurantId);
    List<RestaurantOrder> findByRestaurantIdAndStatusOrderByCreatedAtDesc(UUID restaurantId, String status);
    List<RestaurantOrder> findByCustomerIdOrderByCreatedAtDesc(UUID customerId);
}
