package com.restaurant.platform.repository;

import com.restaurant.platform.entity.ProductModifierGroup;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
import com.restaurant.platform.entity.ProductModifierGroupId;
import java.util.List;

/** Spring Data repository for product_modifier_groups. */
public interface ProductModifierGroupRepository extends JpaRepository<ProductModifierGroup, ProductModifierGroupId> {
    List<ProductModifierGroup> findById_ProductId(UUID productId);
    List<ProductModifierGroup> findById_ModifierGroupId(UUID modifierGroupId);
}
