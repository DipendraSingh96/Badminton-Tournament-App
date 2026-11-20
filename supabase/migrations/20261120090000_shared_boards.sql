-- The players' link: a public window onto a tournament.
--
-- A tournament stays private to its owner (it holds phone numbers and money).
-- What players may see is a separate snapshot the organiser's app builds:
-- courts, names as the organiser chose them to appear, times, scores, tables,
-- the bracket and the places. No phone number, check-in mark, money or log is
-- ever put in it. The snapshot lives here, under an id that is the link's
-- secret. Only the owner can write it. The public can read one snapshot, and
-- only by knowing its id, through the function below: the table itself is
-- closed to signed-out visitors, so links can't be listed or searched.

create table public.shared_boards (
  -- The link's secret: a random id made by the organiser's app.
  id uuid primary key,
  -- One link per tournament; it goes when the tournament does.
  tournament_id uuid not null unique references public.tournaments (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- The public snapshot, as the players' page shows it.
  data jsonb not null,
  updated_at timestamptz not null
);

comment on table public.shared_boards is 'The public snapshot behind a tournament''s players'' link. Written only by the tournament''s owner; read by the public only through shared_board(link).';

create index shared_boards_owner_id_idx on public.shared_boards (owner_id);

alter table public.shared_boards enable row level security;

-- Signed out, the table can't be read or written at all.
revoke all on public.shared_boards from anon;
grant select, insert, update, delete on public.shared_boards to authenticated;

create policy "Owners read their shared boards"
  on public.shared_boards for select
  to authenticated
  using (owner_id = (select auth.uid()));

-- A board can only be shared for a tournament that is the user's own.
create policy "Owners share their own tournaments"
  on public.shared_boards for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.tournaments t
      where t.id = tournament_id and t.owner_id = (select auth.uid())
    )
  );

create policy "Owners update their shared boards"
  on public.shared_boards for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.tournaments t
      where t.id = tournament_id and t.owner_id = (select auth.uid())
    )
  );

create policy "Owners stop sharing their boards"
  on public.shared_boards for delete
  to authenticated
  using (owner_id = (select auth.uid()));

-- The public's one way in: the snapshot for exactly this link, or nothing.
-- It runs with the table owner's rights, so it is kept to a single lookup by
-- the secret id and returns only the snapshot and when it was updated.
create function public.shared_board(link uuid)
  returns jsonb
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select jsonb_build_object('data', b.data, 'updated_at', b.updated_at)
  from public.shared_boards b
  where b.id = link
$$;

comment on function public.shared_board(uuid) is 'The public snapshot for a players'' link, or null when the link is not shared.';

revoke all on function public.shared_board(uuid) from public;
grant execute on function public.shared_board(uuid) to anon, authenticated;
