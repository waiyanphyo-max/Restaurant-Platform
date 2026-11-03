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
    String ELIGIBLE_DELIVERY_MEMBERS = """
            SELECT member.*
            FROM public.restaurant_members member
            JOIN auth.users account ON account.id = member.user_id
            WHERE member.restaurant_id = :restaurantId
              AND account.deleted_at IS NULL
              AND (account.banned_until IS NULL OR account.banned_until <= CURRENT_TIMESTAMP)
            """;

    long countByRestaurantId(UUID restaurantId);
    List<RestaurantMember> findByUserId(UUID userId);

    List<RestaurantMember> findByRestaurantIdAndRole(UUID restaurantId, RestaurantRole role);

    List<RestaurantMember> findByRestaurantIdAndRoleOrderByCreatedAtAsc(
            UUID restaurantId, RestaurantRole role);

    List<RestaurantMember> findByRestaurantIdOrderByCreatedAtAsc(UUID restaurantId);

    @Query(value = ELIGIBLE_DELIVERY_MEMBERS + " ORDER BY member.created_at, member.id", nativeQuery = true)
    List<RestaurantMember> findEligibleDeliveryMembers(@Param("restaurantId") UUID restaurantId);

    @Query(value = ELIGIBLE_DELIVERY_MEMBERS + " AND member.role = 'DELIVERY_DRIVER' ORDER BY member.created_at, member.id", nativeQuery = true)
    List<RestaurantMember> findEligibleDeliveryDrivers(@Param("restaurantId") UUID restaurantId);

    @Query(value = ELIGIBLE_DELIVERY_MEMBERS + " AND member.user_id = :userId FOR UPDATE OF member", nativeQuery = true)
    Optional<RestaurantMember> findEligibleDeliveryMemberForUpdate(
            @Param("restaurantId") UUID restaurantId, @Param("userId") UUID userId);

    Optional<RestaurantMember> findByIdAndRestaurantId(UUID id, UUID restaurantId);

    Optional<RestaurantMember> findByRestaurantIdAndUserId(
            UUID restaurantId, UUID userId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select m from RestaurantMember m where m.restaurantId = :restaurantId and m.userId = :userId")
    Optional<RestaurantMember> findByRestaurantIdAndUserIdForUpdate(
            @Param("restaurantId") UUID restaurantId,
            @Param("userId") UUID userId);
}
