package com.restaurant.platform.repository;

import com.restaurant.platform.entity.Product;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

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

    // A recorded reservation can be returned while tracking is paused. A missing balance needs reconciliation.
    @Modifying(flushAutomatically = true)
    @Query("""
    update Product p
       set p.stockQuantity = p.stockQuantity + :quantity
     where p.id = :productId
       and p.restaurantId = :restaurantId
       and p.stockQuantity is not null
    """)
    int releaseStock(
            @Param("productId") UUID productId,
            @Param("restaurantId") UUID restaurantId,
            @Param("quantity") int quantity
    );

    Optional<Product> findByIdAndRestaurantId(
            UUID productId, UUID restaurantId);

    @Modifying
    @Transactional
    @Query("update Product p set p.imageUrl = :imageUrl where p.id = :productId and p.restaurantId = :restaurantId")
    int updateProductImage(@Param("productId") UUID productId, @Param("restaurantId") UUID restaurantId,
                           @Param("imageUrl") String imageUrl);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Product p where p.id = :productId and p.restaurantId = :restaurantId")
    Optional<Product> findByIdAndRestaurantIdForUpdate(
            @Param("productId") UUID productId, @Param("restaurantId") UUID restaurantId);
}
