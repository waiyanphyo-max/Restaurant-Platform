package com.restaurant.platform.repository;

import com.restaurant.platform.entity.RestaurantSettings;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

/** Spring Data repository for restaurant_settings. */
public interface RestaurantSettingsRepository extends JpaRepository<RestaurantSettings, UUID> {
}
