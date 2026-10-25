package com.restaurant.platform.dto.customer;

import java.time.OffsetDateTime;
import java.util.UUID;

public record CustomerProfileResponse(
        UUID id,
        String fullName,
        String phone,
        String preferredLanguage,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt,
        String avatarUrl
) {
    /** Backward-compatible constructor for consumers created before avatar support. */
    public CustomerProfileResponse(
            UUID id, String fullName, String phone, String preferredLanguage,
            OffsetDateTime createdAt, OffsetDateTime updatedAt) {
        this(id, fullName, phone, preferredLanguage, createdAt, updatedAt, null);
    }
}
