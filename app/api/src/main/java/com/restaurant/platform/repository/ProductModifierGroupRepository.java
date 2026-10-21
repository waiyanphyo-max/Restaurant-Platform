package com.restaurant.platform.repository;

import com.restaurant.platform.entity.ProductModifierGroup;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
import com.restaurant.platform.entity.ProductModifierGroupId;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

/** Spring Data repository for product_modifier_groups. */
public interface ProductModifierGroupRepository extends JpaRepository<ProductModifierGroup, ProductModifierGroupId> {
    List<ProductModifierGroup> findById_ProductId(UUID productId);
    List<ProductModifierGroup> findById_ProductIdInAndRestaurantId(List<UUID> productIds, UUID restaurantId);
    List<ProductModifierGroup> findById_ModifierGroupId(UUID modifierGroupId);

    @Query(value = """
    SELECT pmg.modifier_group_id
    FROM public.product_modifier_groups pmg
    WHERE pmg.product_id = :productId
      AND pmg.restaurant_id = :restaurantId
    """, nativeQuery = true)
    List<UUID> findModifierGroupIdsByProductIdAndRestaurantId(
            @Param("productId") UUID productId,
            @Param("restaurantId") UUID restaurantId
    );}
