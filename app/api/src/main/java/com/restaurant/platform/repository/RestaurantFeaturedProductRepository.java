package com.restaurant.platform.repository;

import com.restaurant.platform.entity.RestaurantFeaturedProduct;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface RestaurantFeaturedProductRepository extends JpaRepository<RestaurantFeaturedProduct, UUID> { }
