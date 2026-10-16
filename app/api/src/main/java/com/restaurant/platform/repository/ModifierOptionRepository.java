package com.restaurant.platform.repository;

import com.restaurant.platform.entity.ModifierOption;
import jakarta.validation.constraints.NotNull;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;
import java.util.List;

/** Spring Data repository for modifier_options. */
public interface ModifierOptionRepository extends JpaRepository<ModifierOption, UUID> {
    List<ModifierOption> findByModifierGroupIdAndIsAvailableTrue(UUID modifierGroupId);

    Optional<ModifierOption> findByIdAndRestaurantIdAndIsAvailableTrue(@NotNull UUID uuid, UUID restaurantId);
}