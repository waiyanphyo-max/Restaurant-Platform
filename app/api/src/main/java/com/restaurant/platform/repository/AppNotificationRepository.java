package com.restaurant.platform.repository;

import com.restaurant.platform.entity.AppNotification;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import java.util.UUID;
import java.util.List;
import java.util.Optional;
import java.util.Set;
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

    String CUSTOMER_DELIVERY_NOTIFICATION = """
            n.userId = :userId and n.notificationType in (:types)
            and n.queueTicketId is null
            and exists (select o.id from Order o where o.id = n.orderId
                and o.restaurantId = :restaurantId and o.customerId = :userId and o.orderType = 'DELIVERY')
            """;

    @Query("select n from AppNotification n where " + CUSTOMER_DELIVERY_NOTIFICATION
            + " and (:status is null or n.status = :status) order by n.createdAt desc")
    List<AppNotification> findCustomerDeliveryNotifications(
            @Param("restaurantId") UUID restaurantId, @Param("userId") UUID userId,
            @Param("types") Set<String> types, @Param("status") String status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select n from AppNotification n where n.id = :id and " + CUSTOMER_DELIVERY_NOTIFICATION)
    Optional<AppNotification> findCustomerDeliveryNotificationForUpdate(
            @Param("restaurantId") UUID restaurantId, @Param("userId") UUID userId,
            @Param("types") Set<String> types, @Param("id") UUID id);
}
