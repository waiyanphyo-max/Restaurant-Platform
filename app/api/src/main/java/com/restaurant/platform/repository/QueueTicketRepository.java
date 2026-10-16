package com.restaurant.platform.repository;

import com.restaurant.platform.entity.QueueTicket;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
import java.util.List;
import java.util.Optional;

/** Spring Data repository for queue_tickets. */
public interface QueueTicketRepository extends JpaRepository<QueueTicket, UUID> {
    List<QueueTicket> findByDailyCounterIdAndStatusOrderByQueueNumberAsc(UUID dailyCounterId, String status);
    Optional<QueueTicket> findByPublicTokenHash(String publicTokenHash);
}
