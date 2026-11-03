package com.restaurant.platform.repository;

import com.restaurant.platform.entity.AppNotification;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Spring Data repository for notifications. */
public interface AppNotificationRepository extends JpaRepository<AppNotification, UUID> {
    List<AppNotification> findByUserIdAndStatusOrderByCreatedAtDesc(UUID userId, String status);
    List<AppNotification> findByUserIdOrderByCreatedAtDesc(UUID userId);
    java.util.Optional<AppNotification> findByIdAndUserId(UUID id, UUID userId);
    java.util.Optional<AppNotification> findByIdAndQueueTicketId(UUID id, UUID queueTicketId);
    List<AppNotification> findByQueueTicketIdOrderByCreatedAtDesc(UUID queueTicketId);

    /** Personal inbox, restricted to an order belonging to the requested restaurant. */
    @Query("""
            select n from AppNotification n
            where n.userId = :userId and (:status is null or n.status = :status)
            and exists (select o.id from Order o where o.restaurantId = :restaurantId
                and (n.orderId is not null or n.queueTicketId is not null)
                and (n.orderId is null or o.id = n.orderId)
                and (n.queueTicketId is null or o.queueTicketId = n.queueTicketId))
            order by n.createdAt desc
            """)
    List<AppNotification> findForRestaurantUser(
            @Param("restaurantId") UUID restaurantId, @Param("userId") UUID userId,
            @Param("status") String status);

    @Query("""
            select n from AppNotification n where n.id = :id and n.userId = :userId
            and exists (select o.id from Order o where o.restaurantId = :restaurantId
                and (n.orderId is not null or n.queueTicketId is not null)
                and (n.orderId is null or o.id = n.orderId)
                and (n.queueTicketId is null or o.queueTicketId = n.queueTicketId))
            """)
    java.util.Optional<AppNotification> findForRestaurantUserById(
            @Param("restaurantId") UUID restaurantId, @Param("userId") UUID userId,
            @Param("id") UUID id);
}
