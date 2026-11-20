package com.restaurant.platform.repository;

import com.restaurant.platform.entity.RestaurantBootstrapStep;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RestaurantBootstrapStepRepository extends JpaRepository<RestaurantBootstrapStep, UUID> {
    Optional<RestaurantBootstrapStep> findByRestaurantIdAndOperationKey(UUID restaurantId, String operationKey);
    /** Tenant-locked ordinal avoids clock skew changing review freshness across API hosts. */
    @Query("select s from RestaurantBootstrapStep s where s.restaurantId = :id order by s.stepIndex asc")
    List<RestaurantBootstrapStep> findByRestaurantIdOrderByCompletedAtAscIdAsc(@Param("id") UUID restaurantId);
}
