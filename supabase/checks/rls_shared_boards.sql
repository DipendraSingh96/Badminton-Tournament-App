-- Proves the players' link is safe: only a tournament's owner can share it,
-- the table is closed to signed-out visitors, and the public function gives
-- back one snapshot for the right link and nothing otherwise.
--
-- Run it in the Supabase dashboard's SQL Editor after the shared_boards
-- migration. It makes two throwaway users, a tournament each and a shared
-- board, acts as each of them and as a signed-out visitor, and stops with an
-- error at the first thing that is wrong. Everything it makes is undone at the
-- end, pass or fail.
--
-- A pass ends with one row: "All checks passed". A failure ends with an error
-- that starts "FAILED:" and no such row.

do $$
declare
  alice constant uuid := gen_random_uuid();
  bob constant uuid := gen_random_uuid();
  alices constant uuid := gen_random_uuid();
  -- A second tournament of Alice's, never shared: for the attempts to share it that must fail.
  unshared constant uuid := gen_random_uuid();
  bobs constant uuid := gen_random_uuid();
  link constant uuid := gen_random_uuid();
  seen integer;
  changed integer;
  got jsonb;
begin
  -- Everything below happens inside this inner block, which is always undone.
  begin
  insert into auth.users (id, instance_id, aud, role, email)
  values
    (alice, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-check-alice@example.invalid'),
    (bob, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-check-bob@example.invalid');

  -- As Alice: a tournament, and its board shared under a link.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  insert into public.tournaments (id, name, data, updated_at) values (alices, 'Alice''s', '{"phone":"private"}', now());
  insert into public.tournaments (id, name, data, updated_at) values (unshared, 'Alice''s other', '{}', now());
  insert into public.shared_boards (id, tournament_id, data, updated_at) values (link, alices, '{"name":"Alice''s"}', now());
  select count(*) into seen from public.shared_boards where id = link and owner_id = alice;
  if seen <> 1 then raise exception 'FAILED: a shared board should belong to the user who shared it'; end if;

  -- As Bob: his own tournament.
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  insert into public.tournaments (id, name, data, updated_at) values (bobs, 'Bob''s', '{}', now());

  -- Bob can't see, change or remove Alice's shared board in the table.
  select count(*) into seen from public.shared_boards;
  if seen <> 0 then raise exception 'FAILED: Bob can read % shared boards in the table that are not his', seen; end if;
  update public.shared_boards set data = '{"name":"Defaced"}' where id = link;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'FAILED: Bob changed Alice''s shared board'; end if;
  delete from public.shared_boards where id = link;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'FAILED: Bob removed Alice''s shared board'; end if;

  -- Bob can't share a board for Alice's tournament, in his name or in hers.
  begin
    insert into public.shared_boards (id, tournament_id, data, updated_at) values (gen_random_uuid(), unshared, '{}', now());
    raise exception 'FAILED: Bob shared a board for Alice''s tournament';
  exception
    when insufficient_privilege then null;
  end;
  begin
    insert into public.shared_boards (id, tournament_id, owner_id, data, updated_at) values (gen_random_uuid(), bobs, alice, '{}', now());
    raise exception 'FAILED: Bob shared a board in Alice''s name';
  exception
    when insufficient_privilege then null;
  end;

  -- Bob can share his own.
  insert into public.shared_boards (id, tournament_id, data, updated_at) values (gen_random_uuid(), bobs, '{"name":"Bob''s"}', now());

  -- Signed out: the table is closed, both ways.
  execute 'reset role';
  execute 'set local role anon';
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  begin
    select count(*) into seen from public.shared_boards;
    if seen <> 0 then raise exception 'FAILED: a signed-out visitor can read % shared boards from the table', seen; end if;
  exception
    when insufficient_privilege then null;
  end;
  begin
    insert into public.shared_boards (id, tournament_id, owner_id, data, updated_at) values (gen_random_uuid(), unshared, alice, '{}', now());
    raise exception 'FAILED: a signed-out visitor shared a board';
  exception
    when insufficient_privilege then null;
  end;
  -- And the tournaments themselves stay closed.
  begin
    select count(*) into seen from public.tournaments;
    if seen <> 0 then raise exception 'FAILED: a signed-out visitor can read % tournaments', seen; end if;
  exception
    when insufficient_privilege then null;
  end;

  -- Signed out, with the link: the snapshot, and only the snapshot.
  got := public.shared_board(link);
  if got is null then raise exception 'FAILED: the link gives nothing to a signed-out visitor'; end if;
  if got -> 'data' ->> 'name' <> 'Alice''s' then raise exception 'FAILED: the link gives the wrong snapshot'; end if;
  if got::text like '%private%' then raise exception 'FAILED: the link gives out the tournament itself'; end if;
  if got ? 'owner_id' or got ? 'tournament_id' then raise exception 'FAILED: the link gives out more than the snapshot'; end if;

  -- Signed out, with a wrong link: nothing.
  if public.shared_board(gen_random_uuid()) is not null then raise exception 'FAILED: a wrong link gives a snapshot'; end if;

  -- When the tournament is deleted, its link stops working.
  execute 'reset role';
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  delete from public.tournaments where id = alices;
  if public.shared_board(link) is not null then raise exception 'FAILED: the link outlives its tournament'; end if;

  -- Every check passed: undo the users, the tournaments, the boards and the roles taken.
  raise exception using errcode = 'RB001', message = 'undo';
  exception
    when sqlstate 'RB001' then null;
  end;
end
$$;

select 'All checks passed' as result;
