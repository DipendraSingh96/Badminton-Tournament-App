-- Proves that a tournament can be read and changed only by the user who made it.
--
-- Run it in the Supabase dashboard's SQL Editor after the tournaments migration.
-- It makes two throwaway users and a tournament for each, acts as each of them
-- and as a signed-out visitor, and stops with an error at the first thing that
-- is wrong. Everything it makes is undone at the end, pass or fail.
--
-- A pass ends with one row: "All checks passed". A failure ends with an error
-- that starts "FAILED:" and no such row.

do $$
declare
  alice constant uuid := gen_random_uuid();
  bob constant uuid := gen_random_uuid();
  alices constant uuid := gen_random_uuid();
  bobs constant uuid := gen_random_uuid();
  seen integer;
  changed integer;
begin
  -- Everything below happens inside this inner block, which is always undone.
  begin
  insert into auth.users (id, instance_id, aud, role, email)
  values
    (alice, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-check-alice@example.invalid'),
    (bob, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-check-bob@example.invalid');

  -- As Alice: she adds a tournament; it is hers without her saying so.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  insert into public.tournaments (id, name, data, updated_at) values (alices, 'Alice''s', '{}', now());
  select count(*) into seen from public.tournaments where id = alices and owner_id = alice;
  if seen <> 1 then raise exception 'FAILED: a new tournament should belong to the user who added it'; end if;

  -- As Bob: he adds his own.
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  insert into public.tournaments (id, name, data, updated_at) values (bobs, 'Bob''s', '{}', now());

  -- Bob sees his own and not Alice's.
  select count(*) into seen from public.tournaments where id in (alices, bobs);
  if seen <> 1 then raise exception 'FAILED: Bob should see 1 of the two tournaments, saw %', seen; end if;
  select count(*) into seen from public.tournaments where id = alices;
  if seen <> 0 then raise exception 'FAILED: Bob can read Alice''s tournament'; end if;

  -- Bob can't change or delete Alice's.
  update public.tournaments set name = 'Taken' where id = alices;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'FAILED: Bob changed Alice''s tournament'; end if;
  delete from public.tournaments where id = alices;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'FAILED: Bob deleted Alice''s tournament'; end if;

  -- Bob can't add a tournament in Alice's name, or hand his to her.
  begin
    insert into public.tournaments (id, owner_id, name, data, updated_at) values (gen_random_uuid(), alice, 'Planted', '{}', now());
    raise exception 'FAILED: Bob added a tournament as Alice';
  exception
    when insufficient_privilege then null;
  end;
  begin
    update public.tournaments set owner_id = alice where id = bobs;
    raise exception 'FAILED: Bob handed his tournament to Alice';
  exception
    when insufficient_privilege then null;
  end;

  -- As Alice again: hers is untouched, and Bob's is not hers to see.
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  select count(*) into seen from public.tournaments where id = alices and name = 'Alice''s';
  if seen <> 1 then raise exception 'FAILED: Alice''s tournament was changed or is gone'; end if;
  select count(*) into seen from public.tournaments where id = bobs;
  if seen <> 0 then raise exception 'FAILED: Alice can read Bob''s tournament'; end if;

  -- Signed out: nothing can be read or added.
  execute 'reset role';
  execute 'set local role anon';
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  begin
    select count(*) into seen from public.tournaments;
    if seen <> 0 then raise exception 'FAILED: a signed-out visitor can read % tournaments', seen; end if;
  exception
    when insufficient_privilege then null;
  end;
  begin
    insert into public.tournaments (id, owner_id, name, data, updated_at) values (gen_random_uuid(), alice, 'Planted', '{}', now());
    raise exception 'FAILED: a signed-out visitor added a tournament';
  exception
    when insufficient_privilege then null;
  end;

  -- Every check passed: undo the users, the tournaments and the roles taken.
  raise exception using errcode = 'RB001', message = 'undo';
  exception
    when sqlstate 'RB001' then null;
  end;
end
$$;

select 'All checks passed' as result;
