package com.restaurant.platform.repository;

import com.restaurant.platform.entity.ProductVariant;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
import java.util.List;

/** Spring Data repository for product_variants. */
public interface ProductVariantRepository extends JpaRepository<ProductVariant, UUID> {
    List<ProductVariant> findByProductIdAndIsAvailableTrue(UUID productId);
}
