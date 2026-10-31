package com.restaurant.platform.repository;

import com.restaurant.platform.entity.Order;
import com.restaurant.platform.repository.projection.DailyOrderAggregate;
import java.time.OffsetDateTime;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

import java.util.Optional;
import java.util.UUID;

public interface OrderRepository
        extends JpaRepository<Order, UUID> {

    long countByRestaurantId(UUID restaurantId);

    Optional<Order> findByIdAndRestaurantId(
            UUID id,
            UUID restaurantId
    );

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select o from Order o where o.id = :orderId and o.restaurantId = :restaurantId")
    Optional<Order> findByIdAndRestaurantIdForUpdate(
            @Param("orderId") UUID orderId,
            @Param("restaurantId") UUID restaurantId
    );

    Optional<Order> findByQueueTicketId(
            UUID queueTicketId
    );

    Page<Order> findByRestaurantId(
            UUID restaurantId,
            Pageable pageable
    );

    Page<Order> findByRestaurantIdAndStatus(
            UUID restaurantId,
            String status,
            Pageable pageable
    );

    Page<Order> findByCustomerIdOrderByCreatedAtDesc(
            UUID customerId, Pageable pageable);

    Page<Order> findByCustomerIdAndStatusOrderByCreatedAtDesc(
            UUID customerId, String status, Pageable pageable);

    Optional<Order> findByIdAndCustomerId(UUID id, UUID customerId);

    @Query(value = """
            select count(*) as "totalOrders",
                   count(*) filter (where status = 'PENDING') as "pendingOrders",
                   count(*) filter (where status = 'ACCEPTED') as "acceptedOrders",
                   count(*) filter (where status = 'PREPARING') as "preparingOrders",
                   count(*) filter (where status = 'READY') as "readyOrders",
                   count(*) filter (where status = 'OUT_FOR_DELIVERY') as "outForDeliveryOrders",
                   count(*) filter (where status = 'COMPLETED') as "completedOrders",
                   count(*) filter (where status = 'CANCELLED') as "cancelledOrders",
                   coalesce(sum(total_amount) filter (where status <> 'CANCELLED'), 0)
                       as "orderAmountExcludingCancelled"
            from public.orders
            where restaurant_id = :restaurantId
              and created_at >= :startAt
              and created_at < :endAt
            """, nativeQuery = true)
    DailyOrderAggregate aggregateOrdersForCreatedWindow(
            @Param("restaurantId") UUID restaurantId,
            @Param("startAt") OffsetDateTime startAt,
            @Param("endAt") OffsetDateTime endAt);


    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select o from Order o where o.id = :orderId and o.customerId = :customerId")
    Optional<Order> findByIdAndCustomerIdForUpdate(
            @Param("orderId") UUID orderId,
            @Param("customerId") UUID customerId);

}
