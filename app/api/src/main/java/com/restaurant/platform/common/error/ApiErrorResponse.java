package com.restaurant.platform.common.error;

import java.time.Instant;
import java.util.List;

/** Stable API error format. `code` is language-independent; `message` is localized. */
public record ApiErrorResponse(
        Instant timestamp,
        int status,
        String code,
        String message,
        String path,
        List<FieldViolation> errors) {

    public ApiErrorResponse {
        errors = errors == null ? List.of() : List.copyOf(errors);
    }

    public record FieldViolation(String field, String message) {
    }

    public static ApiErrorResponse of(
            int status, String code, String message, String path) {
        return new ApiErrorResponse(Instant.now(), status, code, message, path, List.of());
    }
}
