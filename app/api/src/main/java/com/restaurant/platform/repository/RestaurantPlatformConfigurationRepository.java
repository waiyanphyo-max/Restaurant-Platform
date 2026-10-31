package com.restaurant.platform.repository;

import com.restaurant.platform.entity.RestaurantPlatformConfiguration;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface RestaurantPlatformConfigurationRepository
        extends JpaRepository<RestaurantPlatformConfiguration, UUID> {}
