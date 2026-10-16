package com.restaurant.platform.repository;

import com.restaurant.platform.entity.Delivery;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
import java.util.List;
import java.util.Optional;

/** Spring Data repository for deliveries. */
public interface DeliveryRepository extends JpaRepository<Delivery, UUID> {
    Optional<Delivery> findByOrderId(UUID orderId);
    List<Delivery> findByDriverUserIdAndStatusOrderByCreatedAtDesc(UUID driverUserId, String status);
}
