package com.restaurant.platform.service;

/** Sanitized Supabase Auth Admin failure; provider details are not exposed to API callers. */
public class SupabaseAuthAdminException extends RuntimeException {
    private final boolean configurationError;
    private final boolean alreadyRegistered;

    public SupabaseAuthAdminException(
            String message, boolean configurationError, boolean alreadyRegistered, Throwable cause) {
        super(message, cause);
        this.configurationError = configurationError;
        this.alreadyRegistered = alreadyRegistered;
    }

    public boolean isConfigurationError() {
        return configurationError;
    }

    public boolean isAlreadyRegistered() {
        return alreadyRegistered;
    }
}
