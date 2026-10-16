package com.restaurant.platform.repository;

import com.restaurant.platform.entity.DeliveryZone;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
import java.util.List;

/** Spring Data repository for delivery_zones. */
public interface DeliveryZoneRepository extends JpaRepository<DeliveryZone, UUID> {
    List<DeliveryZone> findByRestaurantIdAndIsActiveTrue(UUID restaurantId);
}
