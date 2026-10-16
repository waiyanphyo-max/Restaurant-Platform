package com.restaurant.platform.repository;

import com.restaurant.platform.entity.DeliveryStatusHistory;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
import java.util.List;

/** Spring Data repository for delivery_status_history. */
public interface DeliveryStatusHistoryRepository extends JpaRepository<DeliveryStatusHistory, UUID> {
    List<DeliveryStatusHistory> findByDeliveryIdOrderByCreatedAtAsc(UUID deliveryId);
}
