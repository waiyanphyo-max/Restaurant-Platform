package com.restaurant.platform.repository;

import com.restaurant.platform.entity.Category;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;
import java.util.List;

/** Spring Data repository for categories. */
public interface CategoryRepository extends JpaRepository<Category, UUID> {
    List<Category> findByRestaurantIdAndIsActiveTrueOrderByDisplayOrderAsc(UUID restaurantId);

    List<Category> findByRestaurantIdOrderByDisplayOrderAsc(UUID restaurantId);

    Optional<Category> findByIdAndRestaurantId(UUID categoryId, UUID restaurantId);

    Optional<Category> findByIdAndRestaurantIdAndIsActiveTrue(
            UUID categoryId, UUID restaurantId);

}
