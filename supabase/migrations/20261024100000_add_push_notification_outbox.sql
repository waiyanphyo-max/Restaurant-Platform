-- Durable per-device push delivery. Notifications remain in public.notifications
-- for in-app history; this outbox tracks external FCM delivery independently per device.

CREATE TABLE public.push_notification_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID NOT NULL
        REFERENCES public.notifications(id) ON DELETE CASCADE,
    user_id UUID NOT NULL
        REFERENCES public.profiles(id) ON DELETE CASCADE,
    device_id UUID NOT NULL
        REFERENCES public.user_devices(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'SKIPPED')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    locked_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    last_error VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_push_outbox_notification_device UNIQUE (notification_id, device_id)
);

CREATE INDEX push_notification_outbox_due_idx
    ON public.push_notification_outbox (status, next_attempt_at, created_at);

CREATE INDEX push_notification_outbox_stale_lock_idx
    ON public.push_notification_outbox (locked_at)
    WHERE status = 'PROCESSING';

ALTER TABLE public.push_notification_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.push_notification_outbox FROM anon, authenticated;

COMMENT ON TABLE public.push_notification_outbox IS
    'Durable per-device push delivery queue. Payload stays in notifications and device token stays in user_devices.';

CREATE OR REPLACE FUNCTION public.enqueue_user_notification_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Public queue-ticket notifications have no user_id and continue to use
    -- queue-token polling/client-side sound; they do not map to user devices.
    IF NEW.user_id IS NOT NULL AND NEW.channel = 'IN_APP' THEN
        INSERT INTO public.push_notification_outbox
            (notification_id, user_id, device_id)
        SELECT NEW.id, NEW.user_id, device.id
        FROM public.user_devices AS device
        WHERE device.user_id = NEW.user_id
          AND device.is_active = TRUE
        ON CONFLICT (notification_id, device_id) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_user_notification_push()
    FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_enqueue_user_notification_push ON public.notifications;

CREATE TRIGGER trg_enqueue_user_notification_push
    AFTER INSERT ON public.notifications
    FOR EACH ROW
    EXECUTE FUNCTION public.enqueue_user_notification_push();
