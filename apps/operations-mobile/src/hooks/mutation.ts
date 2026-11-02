import { ApiHttpError, ApiNetworkError, ApiTimeoutError, MissingAccessTokenError } from "@restaurant-platform/api-client";

/** Synchronous gate prevents two taps before React has rendered the busy state. */
export class MutationGate {
  private pending = false;
  begin() { if (this.pending) return false; this.pending = true; return true; }
  end() { this.pending = false; }
}

export function mutationError(error: unknown): string {
  if (error instanceof MissingAccessTokenError || error instanceof ApiHttpError && error.status === 401) return "Your session expired. Sign in again.";
  if (error instanceof ApiHttpError) {
    if (error.code === "MEMBER_INVITATION_NOT_CONFIGURED") return "The invitation provider is not configured. Ask your administrator to configure Supabase invitations.";
    if (error.code === "MEMBER_EMAIL_ALREADY_REGISTERED") return "This email already has an Auth account. Use the verified account onboarding process.";
    if (["MEMBER_INVITATION_PROVIDER_ERROR", "MEMBER_INVITATION_INVALID_PROVIDER_RESPONSE", "MEMBER_INVITATION_PROFILE_MISSING"].includes(error.code)) return "The invitation provider or account synchronization failed. Refresh the team before retrying.";
    if (error.status === 403) return "Your account does not have permission for this action.";
    if (error.status === 404) return "This record is no longer available. Refresh and try again.";
    if (error.status === 409) return "The record changed or this action is not valid in its current state. Refresh before retrying.";
    if (error.status === 503) return "This service is not configured or is temporarily unavailable. Contact your administrator.";
    if (error.status === 400 || error.status === 422) return "Check the entered values and the current record state, then try again.";
    return "The server could not complete the action. Refresh before retrying.";
  }
  if (error instanceof ApiNetworkError || error instanceof ApiTimeoutError) return "Connection lost. The action may have reached the server. Refresh to check before retrying.";
  // Validation messages originate locally; do not display arbitrary server exception payloads.
  if (error instanceof FormValidationError) return error.message;
  return "The action could not be completed. Refresh and try again.";
}

export class FormValidationError extends Error {}
