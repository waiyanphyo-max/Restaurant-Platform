package com.restaurant.platform.repository;

import com.restaurant.platform.entity.UserDevice;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
import java.util.List;
import java.util.Optional;

/** Spring Data repository for user_devices. */
public interface UserDeviceRepository extends JpaRepository<UserDevice, UUID> {
    List<UserDevice> findByUserIdAndIsActiveTrue(UUID userId);
    Optional<UserDevice> findByPushToken(String pushToken);
}
