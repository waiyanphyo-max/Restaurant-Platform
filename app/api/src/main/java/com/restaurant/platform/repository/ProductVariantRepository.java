package com.restaurant.platform.repository;

import com.restaurant.platform.entity.ProductVariant;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.Optional;
import java.util.UUID;
import java.util.List;

/** Spring Data repository for product_variants. */
public interface ProductVariantRepository extends JpaRepository<ProductVariant, UUID> {
    List<ProductVariant> findByProductIdAndIsAvailableTrue(UUID productId);

    List<ProductVariant>
    findByProductIdInOrderByNameAsc(
            Collection<UUID> productIds
    );

    List<ProductVariant> findByProductId(UUID productId);

    Optional<ProductVariant> findByIdAndProductId(
            UUID variantId, UUID productId);
}
