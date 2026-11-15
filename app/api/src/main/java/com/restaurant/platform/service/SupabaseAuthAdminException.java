package com.restaurant.platform.service;

/** Sanitized Supabase Auth Admin failure; provider details are not exposed to API callers. */
public class SupabaseAuthAdminException extends RuntimeException {
    private final boolean configurationError;
    private final boolean alreadyRegistered;
    private final boolean rateLimited;

    public SupabaseAuthAdminException(
            String message, boolean configurationError, boolean alreadyRegistered, Throwable cause) {
        this(message, configurationError, alreadyRegistered, false, cause);
    }

    public SupabaseAuthAdminException(
            String message, boolean configurationError, boolean alreadyRegistered,
            boolean rateLimited, Throwable cause) {
        super(message, cause);
        this.configurationError = configurationError;
        this.alreadyRegistered = alreadyRegistered;
        this.rateLimited = rateLimited;
    }

    public boolean isConfigurationError() {
        return configurationError;
    }

    public boolean isAlreadyRegistered() {
        return alreadyRegistered;
    }

    public boolean isRateLimited() {
        return rateLimited;
    }
}
