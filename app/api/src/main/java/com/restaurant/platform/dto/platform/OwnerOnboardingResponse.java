package com.restaurant.platform.dto.platform;

import java.time.OffsetDateTime;

public record OwnerOnboardingResponse(String onboardingStatus, OffsetDateTime completedAt) {}
