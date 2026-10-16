package com.restaurant.platform.repository;

import com.restaurant.platform.entity.DailyQueueCounter;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
import java.util.Optional;
import java.time.LocalDate;

/** Spring Data repository for daily_queue_counters. */
public interface DailyQueueCounterRepository extends JpaRepository<DailyQueueCounter, UUID> {
    Optional<DailyQueueCounter> findByRestaurantIdAndQueueDate(UUID restaurantId, LocalDate queueDate);
}
