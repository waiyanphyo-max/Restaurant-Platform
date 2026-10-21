package com.restaurant.platform.repository;

import com.restaurant.platform.entity.Restaurant;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;
import java.util.List;

/** Spring Data repository for restaurants. */
public interface RestaurantRepository extends JpaRepository<Restaurant, UUID> {
    List<Restaurant> findByIsActiveTrueOrderByNameAsc();

    Optional<Restaurant> findByIdAndIsActiveTrue(UUID id);

    boolean existsBySlug(String slug);
}
