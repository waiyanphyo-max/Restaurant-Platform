package com.restaurant.platform.repository;

import com.restaurant.platform.entity.UserDevice;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
import java.util.List;
import java.util.Optional;

/** Device ownership queries use the authenticated profile ID. */
public interface UserDeviceRepository extends JpaRepository<UserDevice, UUID> {
    List<UserDevice> findByUserIdAndIsActiveTrue(UUID userId);

    List<UserDevice> findByUserIdOrderByCreatedAtDesc(UUID userId);

    Optional<UserDevice> findByPushToken(String pushToken);

    Optional<UserDevice> findByIdAndUserId(UUID id, UUID userId);
}
