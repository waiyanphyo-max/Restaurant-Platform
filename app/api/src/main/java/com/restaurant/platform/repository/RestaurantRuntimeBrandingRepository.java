package com.restaurant.platform.repository;

import com.restaurant.platform.entity.RestaurantRuntimeBranding;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface RestaurantRuntimeBrandingRepository extends JpaRepository<RestaurantRuntimeBranding, UUID> { }
