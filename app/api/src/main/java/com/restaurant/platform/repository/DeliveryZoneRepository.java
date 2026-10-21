package com.restaurant.platform.repository;

import com.restaurant.platform.entity.DeliveryZone;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;
import java.util.List;
import java.util.Optional;

/** Delivery zones are scoped to the restaurant that owns them. */
public interface DeliveryZoneRepository extends JpaRepository<DeliveryZone, UUID> {
    List<DeliveryZone> findByRestaurantIdAndIsActiveTrue(UUID restaurantId);

    Optional<DeliveryZone> findByIdAndRestaurantIdAndIsActiveTrue(
            UUID id, UUID restaurantId);

    Optional<DeliveryZone> findByIdAndRestaurantId(UUID id, UUID restaurantId);

    List<DeliveryZone> findByRestaurantIdOrderByNameAsc(UUID restaurantId);
}
