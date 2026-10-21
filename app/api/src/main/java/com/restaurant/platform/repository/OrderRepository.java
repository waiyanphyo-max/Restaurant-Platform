package com.restaurant.platform.repository;

import com.restaurant.platform.entity.Order;

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

    Page<Order> findByRestaurantIdOrderByCreatedAtDesc(
            UUID restaurantId,
            Pageable pageable
    );

    Page<Order> findByRestaurantIdAndStatusOrderByCreatedAtDesc(
            UUID restaurantId,
            String status,
            Pageable pageable
    );
}