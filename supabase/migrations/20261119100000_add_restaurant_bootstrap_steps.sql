-- UXI-04 source migration, for separate release review. No hosted execution is authorized.
-- Serialize all bootstrap writes by locking their existing restaurant row in Spring.
create table public.restaurant_bootstrap_steps (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    operation_key varchar(100) not null check (operation_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$'),
    kind varchar(40) not null check (kind in ('CATEGORY','PRODUCT','VARIANT','MODIFIER_GROUP',
        'MODIFIER_OPTION','ATTACH_MODIFIER_GROUP','MEDIA_MANIFEST','ORDERING_SETTINGS','COMPLETE_CATALOG','HANDOFF')),
    request_hash varchar(64) not null check (request_hash ~ '^[0-9a-f]{64}$'),
    resource_id uuid,
    result jsonb not null check (jsonb_typeof(result) = 'object'),
    actor_id uuid not null,
    completed_at timestamptz not null default now(),
    step_index bigint not null check (step_index > 0),
    unique (restaurant_id, operation_key),
    unique (restaurant_id, step_index)
);
create index restaurant_bootstrap_steps_restaurant_time_idx
    on public.restaurant_bootstrap_steps (restaurant_id, step_index);
alter table public.restaurant_bootstrap_steps enable row level security;
-- Backend-only receipts, including private actor and reviewed media data.
revoke all on public.restaurant_bootstrap_steps from PUBLIC, anon, authenticated, service_role;
-- Only the trusted Spring database principal may read/write receipts.
comment on table public.restaurant_bootstrap_steps is
    'UXI-04 append-only platform-admin initial setup receipts; no client RLS policy or public view.';