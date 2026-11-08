package com.restaurant.platform.repository;

import com.restaurant.platform.entity.Profile;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;
import java.util.UUID;
import java.util.Optional;

/** Spring Data repository for profiles. */
public interface ProfileRepository extends JpaRepository<Profile, UUID> {
    Optional<Profile> findFirstByEmailIgnoreCase(String email);

    @Modifying
    @Transactional
    @Query(value = """
            INSERT INTO public.profiles (id, avatar_path)
            VALUES (:userId, :avatarPath)
            ON CONFLICT (id) DO UPDATE SET avatar_path = EXCLUDED.avatar_path, avatar_url = NULL
            """, nativeQuery = true)
    void saveAvatarPath(@Param("userId") UUID userId, @Param("avatarPath") String avatarPath);
}
