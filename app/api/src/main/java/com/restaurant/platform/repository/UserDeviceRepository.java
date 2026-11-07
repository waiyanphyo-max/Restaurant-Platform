package com.restaurant.platform.repository;

import com.restaurant.platform.entity.UserDevice;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.UUID;
import java.util.List;
import java.util.Optional;

/** Device ownership queries use the authenticated profile ID. */
public interface UserDeviceRepository extends JpaRepository<UserDevice, UUID> {
    List<UserDevice> findByUserIdAndIsActiveTrue(UUID userId);

    List<UserDevice> findByUserIdOrderByCreatedAtDesc(UUID userId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<UserDevice> findByPushToken(String pushToken);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<UserDevice> findByIdAndUserId(UUID id, UUID userId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select d from UserDevice d where d.id = :id and d.userId = :userId
                and d.platform = 'ANDROID'
                and (d.customerRestaurantId = :restaurantId or d.customerRestaurantId is null)
            """)
    Optional<UserDevice> findCustomerAndroidDevice(
            @Param("restaurantId") UUID restaurantId, @Param("userId") UUID userId, @Param("id") UUID id);
}
