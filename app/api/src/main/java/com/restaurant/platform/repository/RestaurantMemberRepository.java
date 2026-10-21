package com.restaurant.platform.repository;

import com.restaurant.platform.entity.RestaurantMember;
import com.restaurant.platform.security.RestaurantRole;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;
import java.util.List;

/** Spring Data repository for restaurant_members. */
public interface RestaurantMemberRepository extends JpaRepository<RestaurantMember, UUID> {
    List<RestaurantMember> findByUserId(UUID userId);
    List<RestaurantMember> findByRestaurantIdAndRole(UUID restaurantId, RestaurantRole role);

    Optional<RestaurantMember> findByRestaurantIdAndUserId(
            UUID restaurantId, UUID userId);
}
