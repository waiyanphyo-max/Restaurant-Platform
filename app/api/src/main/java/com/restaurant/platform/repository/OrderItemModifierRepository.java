package com.restaurant.platform.repository;

import com.restaurant.platform.entity.OrderItemModifier;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
import java.util.List;

/** Spring Data repository for order_item_modifiers. */
public interface OrderItemModifierRepository extends JpaRepository<OrderItemModifier, UUID> {
    List<OrderItemModifier> findByOrderItemId(UUID orderItemId);
    List<OrderItemModifier> findByOrderItemIdInAndRestaurantIdOrderByIdAsc(List<UUID> orderItemIds, UUID restaurantId);
}
