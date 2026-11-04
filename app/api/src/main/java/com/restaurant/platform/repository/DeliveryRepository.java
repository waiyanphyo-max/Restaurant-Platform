package com.restaurant.platform.repository;

import com.restaurant.platform.entity.Delivery;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

/** Spring Data repository for deliveries. */
public interface DeliveryRepository extends JpaRepository<Delivery, UUID> {
    Optional<Delivery> findByOrderId(UUID orderId);

    boolean existsByOrderIdAndDriverUserId(UUID orderId, UUID driverUserId);

    @Query("""
            select d from Delivery d, Order o
            where d.orderId = o.id and d.id = :deliveryId and o.restaurantId = :restaurantId
            """)
    Optional<Delivery> findByIdAndRestaurantId(
            @Param("deliveryId") UUID deliveryId, @Param("restaurantId") UUID restaurantId);

    @Query("""
            select d from Delivery d, Order o
            where d.orderId = o.id and d.id = :deliveryId and o.restaurantId = :restaurantId
              and d.driverUserId = :driverUserId
            """)
    Optional<Delivery> findByIdAndRestaurantIdAndDriverUserId(
            @Param("deliveryId") UUID deliveryId, @Param("restaurantId") UUID restaurantId,
            @Param("driverUserId") UUID driverUserId);

    @Query("""
            select o.id from Delivery d, Order o
            where d.orderId = o.id and d.id = :deliveryId and o.restaurantId = :restaurantId
            """)
    Optional<UUID> findOrderIdByDeliveryIdAndRestaurantId(
            @Param("deliveryId") UUID deliveryId, @Param("restaurantId") UUID restaurantId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select d from Delivery d where d.id = :deliveryId")
    Optional<Delivery> findByIdForUpdate(@Param("deliveryId") UUID deliveryId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select d from Delivery d where d.orderId = :orderId")
    Optional<Delivery> findByOrderIdForUpdate(@Param("orderId") UUID orderId);

    @Query(value = """
            select d from Delivery d, Order o
            where d.orderId = o.id
              and o.restaurantId = :restaurantId
              and (:status is null or d.status = :status)
            """,
            countQuery = """
            select count(d) from Delivery d, Order o
            where d.orderId = o.id
              and o.restaurantId = :restaurantId
              and (:status is null or d.status = :status)
            """)
    Page<Delivery> findPageByRestaurantIdAndOptionalStatus(
            @Param("restaurantId") UUID restaurantId,
            @Param("status") String status,
            Pageable pageable);

    @Query(value = """
            select d from Delivery d, Order o
            where d.orderId = o.id
              and o.restaurantId = :restaurantId
              and d.driverUserId = :driverUserId
              and (:status is null or d.status = :status)
            """,
            countQuery = """
            select count(d) from Delivery d, Order o
            where d.orderId = o.id
              and o.restaurantId = :restaurantId
              and d.driverUserId = :driverUserId
              and (:status is null or d.status = :status)
            """)
    Page<Delivery> findPageByDriverAndRestaurantIdAndOptionalStatus(
            @Param("restaurantId") UUID restaurantId,
            @Param("driverUserId") UUID driverUserId,
            @Param("status") String status,
            Pageable pageable);
}
