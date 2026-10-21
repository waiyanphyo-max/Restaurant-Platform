package com.restaurant.platform.repository;

import com.restaurant.platform.entity.ModifierGroup;
import com.restaurant.platform.entity.ModifierOption;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;
import java.util.List;

/** Spring Data repository for modifier_groups. */
public interface ModifierGroupRepository extends JpaRepository<ModifierGroup, UUID> {
    List<ModifierGroup> findByRestaurantIdAndIsActiveTrue(UUID restaurantId);

    Optional<ModifierGroup> findByIdAndRestaurantIdAndIsActiveTrue(UUID groupId, UUID restaurantId);

    Optional<ModifierGroup> findByIdAndRestaurantId(UUID groupId, UUID restaurantId);

    List<ModifierGroup> findByRestaurantIdOrderByNameAsc(UUID restaurantId);
}
