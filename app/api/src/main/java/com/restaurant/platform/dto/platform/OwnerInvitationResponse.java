package com.restaurant.platform.dto.platform;

import java.time.OffsetDateTime;
import java.util.UUID;

/** Provider request acceptance is not a claim of inbox delivery. No link/token is returned. */
public record OwnerInvitationResponse(UUID restaurantId, UUID ownerUserId, String onboardingStatus,
        String emailStatus, OffsetDateTime requestedAt, OffsetDateTime nextAllowedAt) {}
