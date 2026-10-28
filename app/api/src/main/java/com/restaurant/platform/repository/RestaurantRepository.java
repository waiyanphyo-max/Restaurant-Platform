package com.restaurant.platform.repository;

import com.restaurant.platform.entity.Restaurant;
import com.restaurant.platform.dto.platform.PlatformRestaurantSummaryResponse;
import com.restaurant.platform.security.RestaurantRole;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;
import java.util.List;

/** Spring Data repository for restaurants. */
public interface RestaurantRepository extends JpaRepository<Restaurant, UUID> {
    List<Restaurant> findByIsActiveTrueOrderByNameAsc();

    long countByIsActiveTrue();

    long countByIsActiveFalse();

    Optional<Restaurant> findByIdAndIsActiveTrue(UUID id);

    boolean existsBySlug(String slug);

    @Query(value = """
            select new com.restaurant.platform.dto.platform.PlatformRestaurantSummaryResponse(
                r.id, r.name, r.slug, r.city, r.township, r.isActive, r.createdAt,
                (select min(p.fullName) from RestaurantMember m, Profile p
                    where m.restaurantId = r.id and m.role = :ownerRole and p.id = m.userId),
                (select min(p.email) from RestaurantMember m, Profile p
                    where m.restaurantId = r.id and m.role = :ownerRole and p.id = m.userId),
                (select count(members) from RestaurantMember members where members.restaurantId = r.id),
                (select count(orders) from Order orders where orders.restaurantId = r.id)
            )
            from Restaurant r
            where (:searchPattern = '%%'
                or lower(r.name) like :searchPattern
                or lower(r.slug) like :searchPattern
                or lower(r.city) like :searchPattern
                or lower(r.township) like :searchPattern
                or exists (select m.id from RestaurantMember m, Profile p
                    where m.restaurantId = r.id and m.role = :ownerRole and p.id = m.userId
                      and (lower(coalesce(p.fullName, '')) like :searchPattern
                        or lower(coalesce(p.email, '')) like :searchPattern)))
            order by r.createdAt desc
            """,
            countQuery = """
            select count(r)
            from Restaurant r
            where (:searchPattern = '%%'
                or lower(r.name) like :searchPattern
                or lower(r.slug) like :searchPattern
                or lower(r.city) like :searchPattern
                or lower(r.township) like :searchPattern
                or exists (select m.id from RestaurantMember m, Profile p
                    where m.restaurantId = r.id and m.role = :ownerRole and p.id = m.userId
                      and (lower(coalesce(p.fullName, '')) like :searchPattern
                        or lower(coalesce(p.email, '')) like :searchPattern)))
            """)
    Page<PlatformRestaurantSummaryResponse> searchForPlatformAdmin(
            @Param("searchPattern") String searchPattern,
            @Param("ownerRole") RestaurantRole ownerRole,
            Pageable pageable);
}
