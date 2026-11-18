package com.restaurant.platform.repository;

import com.restaurant.platform.entity.Payment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.time.OffsetDateTime;
import java.util.UUID;
import java.util.List;

/** Spring Data repository for payments. */
public interface PaymentRepository extends JpaRepository<Payment, UUID> {
    List<Payment> findByOrderIdOrderByCreatedAtDesc(UUID orderId);

    boolean existsByOrderIdAndMethodAndStatus(UUID orderId, String method, String status);

    java.util.Optional<Payment> findByIdAndOrderId(UUID paymentId, UUID orderId);

    @Query("""
            select distinct p.orderId from Payment p, Order o
            where p.orderId = o.id and o.restaurantId = :restaurantId and p.orderId in :orderIds
              and (p.status in ('PAID', 'REFUNDED', 'PARTIALLY_REFUNDED')
                   or p.paidAt is not null or p.collectedByUserId is not null)
            """)
    List<UUID> findSettledOrderIds(@Param("restaurantId") UUID restaurantId, @Param("orderIds") List<UUID> orderIds);

    @Query(value = """
            select coalesce(sum(p.amount), 0)
            from public.payments p
            join public.orders o on o.id = p.order_id
            where o.restaurant_id = :restaurantId
              and p.status = 'PAID'
              and p.paid_at >= :startAt
              and p.paid_at < :endAt
            """, nativeQuery = true)
    Long sumPaidAmountForRestaurantWindow(
            @Param("restaurantId") UUID restaurantId,
            @Param("startAt") OffsetDateTime startAt,
            @Param("endAt") OffsetDateTime endAt);

}
