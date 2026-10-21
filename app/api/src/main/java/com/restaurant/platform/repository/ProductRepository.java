package com.restaurant.platform.repository;

import com.restaurant.platform.entity.Product;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.Optional;
import java.util.UUID;
import java.util.List;

/** Spring Data repository for products. */
public interface ProductRepository extends JpaRepository<Product, UUID> {
    List<Product> findByRestaurantId(UUID restaurantId);
    List<Product> findByRestaurantIdAndIsAvailableTrue(UUID restaurantId);
    List<Product> findByRestaurantIdAndCategoryIdAndIsAvailableTrue(UUID restaurantId, UUID categoryId);
    List<Product> findByRestaurantIdAndNameContainingIgnoreCase(UUID restaurantId, String name);

    List<Product>
    findByRestaurantIdAndCategoryIdInOrderByNameAsc(
            UUID restaurantId,
            Collection<UUID> categoryIds
    );

    @Modifying(flushAutomatically = true)
    @Query("""
    update Product p
       set p.stockQuantity = p.stockQuantity - :quantity
     where p.id = :productId
       and p.restaurantId = :restaurantId
       and p.isAvailable = true
       and p.trackStock = true
       and p.stockQuantity >= :quantity
    """)
    int reserveStock(
            @Param("productId") UUID productId,
            @Param("restaurantId") UUID restaurantId,
            @Param("quantity") int quantity
    );

    @Modifying(flushAutomatically = true)
    @Query("""
    update Product p
       set p.stockQuantity = p.stockQuantity + :quantity
     where p.id = :productId
       and p.restaurantId = :restaurantId
       and p.trackStock = true
    """)
    int releaseStock(
            @Param("productId") UUID productId,
            @Param("restaurantId") UUID restaurantId,
            @Param("quantity") int quantity
    );

    Optional<Product> findByIdAndRestaurantId(
            UUID productId, UUID restaurantId);
}
