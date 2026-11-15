-- Application-owned proof, never inferred from Auth email confirmation/password hashes.
-- Legacy accounts intentionally have no row until a fresh password sign-in is verified.
CREATE TABLE public.owner_account_onboarding (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    password_verified_at timestamptz NOT NULL
);

-- Reservations commit before any email-provider request. Failures consume limits too.
CREATE TABLE public.owner_invitation_attempts (
    id uuid PRIMARY KEY,
    restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    requested_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    requested_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    outcome text NOT NULL DEFAULT 'RESERVED' CHECK (outcome IN ('RESERVED', 'REQUESTED', 'FAILED')),
    error_code text,
    finished_at timestamptz
);
CREATE INDEX owner_invitation_attempts_owner_time_idx
    ON public.owner_invitation_attempts (owner_user_id, requested_at DESC);
CREATE INDEX owner_invitation_attempts_actor_time_idx
    ON public.owner_invitation_attempts (requested_by_user_id, requested_at DESC);

ALTER TABLE public.owner_account_onboarding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_invitation_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.owner_account_onboarding FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.owner_invitation_attempts FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.owner_account_onboarding IS
    'Backend-only verified password sign-in marker; absence means UNKNOWN, not incomplete.';
COMMENT ON TABLE public.owner_invitation_attempts IS
    'Backend-only durable owner email cooldown and audit; never stores email addresses or tokens.';
