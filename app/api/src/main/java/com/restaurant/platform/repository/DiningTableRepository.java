package com.restaurant.platform.repository;

import com.restaurant.platform.entity.DiningTable;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
import java.util.List;

/** Spring Data repository for dining_tables. */
public interface DiningTableRepository extends JpaRepository<DiningTable, UUID> {
    List<DiningTable> findByRestaurantIdAndIsActiveTrue(UUID restaurantId);
}
