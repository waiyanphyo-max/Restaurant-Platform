package com.restaurant.platform.dto.platform;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

public record BootstrapStepResponse(String operationKey, BootstrapStepRequest.Kind kind,
        UUID resourceId, Map<String, Object> result, UUID actorId, OffsetDateTime completedAt) { }
