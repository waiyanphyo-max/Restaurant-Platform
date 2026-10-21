package com.restaurant.platform.repository;

import com.restaurant.platform.entity.DiningTable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;
import java.util.List;

/** Spring Data repository for dining_tables. */
public interface DiningTableRepository extends JpaRepository<DiningTable, UUID> {
    List<DiningTable> findByRestaurantIdAndIsActiveTrue(UUID restaurantId);

    List<DiningTable> findByRestaurantIdOrderByTableNumberAsc(UUID restaurantId);

    Optional<DiningTable> findByIdAndRestaurantId(UUID id, UUID restaurantId);

    Optional<DiningTable> findByIdAndRestaurantIdAndIsActiveTrue(UUID id, UUID restaurantId);

    Optional<DiningTable> findByRestaurantIdAndTableNumber(UUID restaurantId, String tableNumber);

    Optional<DiningTable> findByRestaurantIdAndQrTokenAndIsActiveTrue(
            UUID restaurantId, String qrToken);
}
