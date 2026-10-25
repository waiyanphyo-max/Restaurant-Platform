package com.restaurant.platform.entity;

import jakarta.persistence.*;
import java.util.UUID;
import java.time.OffsetDateTime;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** JPA mapping for public.profiles. Foreign keys are represented as UUID fields; PostgreSQL enforces the schema constraints. */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "profiles", schema = "public")
public class Profile {
    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "email", length = 320)
    private String email;

    @Column(name = "full_name", length = 150)
    private String fullName;

    @Column(name = "phone", length = 30)
    private String phone;

    @Column(name = "avatar_url", columnDefinition = "text")
    private String avatarUrl;

    /** Private Storage object path; signed URLs are generated on demand because they expire. */
    @Column(name = "avatar_path", columnDefinition = "text")
    private String avatarPath;

    @Column(name = "preferred_language", nullable = false, length = 10)
    private String preferredLanguage = "my-MM";

    @CreationTimestamp
    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

}
