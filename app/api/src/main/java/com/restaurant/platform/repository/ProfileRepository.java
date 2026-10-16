package com.restaurant.platform.repository;

import com.restaurant.platform.entity.Profile;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

/** Spring Data repository for profiles. */
public interface ProfileRepository extends JpaRepository<Profile, UUID> {
}
