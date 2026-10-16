package com.restaurant.platform.repository;

import com.restaurant.platform.entity.ModifierOption;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
import java.util.List;

/** Spring Data repository for modifier_options. */
public interface ModifierOptionRepository extends JpaRepository<ModifierOption, UUID> {
    List<ModifierOption> findByModifierGroupIdAndIsAvailableTrue(UUID modifierGroupId);
}
