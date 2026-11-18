-- Tournaments kept in the organiser's account.
--
-- A tournament is stored whole, as the app saves it (plan, entries, draw, Live
-- results and log), and belongs to the user who made it. Only that user can
-- read or change it: enforced here, in row level security, not only in the app.
-- Its data holds players' names and phone numbers.

create table public.tournaments (
  -- The id the app gives a tournament when it is made.
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null default '',
  -- Null until the organiser sets a date.
  event_date date,
  data jsonb not null,
  -- When it was last changed, set by the app (the later save wins).
  updated_at timestamptz not null,
  created_at timestamptz not null default now()
);

comment on table public.tournaments is 'A tournament, stored whole; readable and writable only by the user who made it.';

create index tournaments_owner_id_idx on public.tournaments (owner_id);

alter table public.tournaments enable row level security;

-- Signed out, nothing can be read or written.
revoke all on public.tournaments from anon;
grant select, insert, update, delete on public.tournaments to authenticated;

create policy "Owners read their tournaments"
  on public.tournaments for select
  to authenticated
  using (owner_id = (select auth.uid()));

create policy "Owners add their tournaments"
  on public.tournaments for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

-- `with check`: a tournament can't be handed to another user.
create policy "Owners change their tournaments"
  on public.tournaments for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "Owners delete their tournaments"
  on public.tournaments for delete
  to authenticated
  using (owner_id = (select auth.uid()));
