package com.restaurant.platform.repository;

import com.restaurant.platform.entity.AppNotification;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
import java.util.List;

/** Spring Data repository for notifications. */
public interface AppNotificationRepository extends JpaRepository<AppNotification, UUID> {
    List<AppNotification> findByUserIdAndStatusOrderByCreatedAtDesc(UUID userId, String status);
    List<AppNotification> findByQueueTicketIdOrderByCreatedAtDesc(UUID queueTicketId);
}
