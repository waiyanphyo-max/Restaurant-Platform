package com.restaurant.platform.repository;

import com.restaurant.platform.entity.Product;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
import java.util.List;

/** Spring Data repository for products. */
public interface ProductRepository extends JpaRepository<Product, UUID> {
    List<Product> findByRestaurantIdAndIsAvailableTrue(UUID restaurantId);
    List<Product> findByRestaurantIdAndCategoryIdAndIsAvailableTrue(UUID restaurantId, UUID categoryId);
    List<Product> findByRestaurantIdAndNameContainingIgnoreCase(UUID restaurantId, String name);
}
