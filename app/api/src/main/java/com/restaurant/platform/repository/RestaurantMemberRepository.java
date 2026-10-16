package com.restaurant.platform.repository;

import com.restaurant.platform.entity.RestaurantMember;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
import java.util.List;

/** Spring Data repository for restaurant_members. */
public interface RestaurantMemberRepository extends JpaRepository<RestaurantMember, UUID> {
    List<RestaurantMember> findByUserId(UUID userId);
    List<RestaurantMember> findByRestaurantIdAndRole(UUID restaurantId, String role);
}
