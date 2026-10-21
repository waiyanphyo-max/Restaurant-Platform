package com.restaurant.platform.repository;

import com.restaurant.platform.entity.QueueTicket;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;
import java.util.UUID;
import java.util.List;
import java.util.Optional;

/** Spring Data repository for queue_tickets. */
public interface QueueTicketRepository extends JpaRepository<QueueTicket, UUID> {
    List<QueueTicket> findByDailyCounterIdAndStatusOrderByQueueNumberAsc(UUID dailyCounterId, String status);
    List<QueueTicket> findByDailyCounterIdOrderByQueueNumberAsc(UUID dailyCounterId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select q from QueueTicket q where q.id = :ticketId and q.restaurantId = :restaurantId")
    Optional<QueueTicket> findByIdAndRestaurantIdForUpdate(
            @Param("ticketId") UUID ticketId,
            @Param("restaurantId") UUID restaurantId);

    Optional<QueueTicket> findByPublicTokenHash(String publicTokenHash);
}
