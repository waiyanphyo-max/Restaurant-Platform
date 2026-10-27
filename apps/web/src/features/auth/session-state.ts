import type { User } from "@supabase/supabase-js";

export type AuthSessionState = {
  user: User | null;
  loading: boolean;
  configurationError: string;
};

export type AuthSessionAction =
  | { type: "session"; user: User | null; error?: string }
  | { type: "configuration-error"; message: string }
  | { type: "signed-out" };

export const initialAuthSessionState: AuthSessionState = {
  user: null,
  loading: true,
  configurationError: "",
};

export function authSessionReducer(state: AuthSessionState, action: AuthSessionAction): AuthSessionState {
  switch (action.type) {
    case "session":
      return { user: action.user, loading: false, configurationError: action.error || "" };
    case "configuration-error":
      return { user: null, loading: false, configurationError: action.message };
    case "signed-out":
      return { user: null, loading: false, configurationError: "" };
  }
}
