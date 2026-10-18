-- Run in the Supabase SQL editor, then start the server with
--   STORAGE=supabase SUPABASE_URL=... SUPABASE_SERVICE_KEY=...
create table if not exists public.apartments (
  id          text primary key,
  data        jsonb not null,
  status      text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists apartments_status_idx on public.apartments (status);

-- The API server talks to Supabase with the service key, so RLS can stay on
-- with no public policies.
alter table public.apartments enable row level security;
