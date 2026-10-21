package com.restaurant.platform.repository;

import com.restaurant.platform.entity.OrderItem;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
import java.util.List;

/** Spring Data repository for order_items. */
public interface OrderItemRepository extends JpaRepository<OrderItem, UUID> {
    List<OrderItem> findByOrderIdOrderByCreatedAtAsc(UUID orderId);
    List<OrderItem> findByOrderIdAndRestaurantIdOrderByCreatedAtAsc(UUID orderId, UUID restaurantId);
    List<OrderItem> findByProductIdOrderByCreatedAtDesc(UUID productId);
}
