package com.restaurant.platform.repository;

import com.restaurant.platform.entity.RestaurantMember;
import com.restaurant.platform.security.RestaurantRole;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;
import java.util.List;

/** Spring Data repository for restaurant_members. */
public interface RestaurantMemberRepository extends JpaRepository<RestaurantMember, UUID> {
    List<RestaurantMember> findByUserId(UUID userId);

    List<RestaurantMember> findByRestaurantIdAndRole(UUID restaurantId, RestaurantRole role);

    List<RestaurantMember> findByRestaurantIdAndRoleOrderByCreatedAtAsc(
            UUID restaurantId, RestaurantRole role);

    List<RestaurantMember> findByRestaurantIdOrderByCreatedAtAsc(UUID restaurantId);

    Optional<RestaurantMember> findByIdAndRestaurantId(UUID id, UUID restaurantId);

    Optional<RestaurantMember> findByRestaurantIdAndUserId(
            UUID restaurantId, UUID userId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select m from RestaurantMember m where m.restaurantId = :restaurantId and m.userId = :userId")
    Optional<RestaurantMember> findByRestaurantIdAndUserIdForUpdate(
            @Param("restaurantId") UUID restaurantId,
            @Param("userId") UUID userId);
}
