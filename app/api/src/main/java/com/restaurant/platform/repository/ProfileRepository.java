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

    /**
     * Repair an interrupted/missing Auth-to-profile sync using the Auth registry,
     * never client metadata or an arbitrary UUID. A concurrent repair or profile
     * edit wins unchanged. This query runs only on the trusted API database role.
     */
    @Modifying
    @Query(value = """
            INSERT INTO public.profiles (id, email, full_name, phone, preferred_language)
            SELECT u.id, u.email,
                   NULLIF(LEFT(BTRIM(COALESCE(u.raw_user_meta_data ->> 'full_name',
                                               u.raw_user_meta_data ->> 'name')), 150), ''),
                   NULLIF(LEFT(BTRIM(u.raw_user_meta_data ->> 'phone'), 30), ''),
                   CASE WHEN u.raw_user_meta_data ->> 'preferred_language' = 'en'
                        THEN 'en' ELSE 'my-MM' END
            FROM auth.users u
            WHERE u.id = :userId AND u.deleted_at IS NULL
              AND (u.banned_until IS NULL OR u.banned_until <= now())
            ON CONFLICT (id) DO NOTHING
            """, nativeQuery = true)
    int restoreMissingFromAuthUser(@Param("userId") UUID userId);

    @Modifying
    @Transactional
    @Query(value = """
            INSERT INTO public.profiles (id, avatar_path)
            VALUES (:userId, :avatarPath)
            ON CONFLICT (id) DO UPDATE SET avatar_path = EXCLUDED.avatar_path, avatar_url = NULL
            """, nativeQuery = true)
    void saveAvatarPath(@Param("userId") UUID userId, @Param("avatarPath") String avatarPath);
}
