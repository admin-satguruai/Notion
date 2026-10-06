-- Idempotent setup. Run in an approved active Supabase project before activation.
-- All objects are server-only. No anon/authenticated table or RPC privileges.
begin;
create table if not exists public.notion_portal_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email) and email ~ '^[^[:space:]@]+@satgurutravel[.]com$'),
  google_sub text unique,
  name text not null,
  role text not null default 'user' check (role in ('user','super_admin')),
  status text not null default 'pending' check (status in ('pending','approved','rejected','revoked')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.notion_portal_users(id),
  last_login_at timestamptz,
  check ((role = 'super_admin') = (email = 'avinash.damale@satgurutravel.com')),
  check (role <> 'super_admin' or status = 'approved'),
  check (google_sub is not null or role = 'super_admin')
);
create table if not exists public.notion_portal_sessions (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references public.notion_portal_users(id) on delete cascade,
  expires_at timestamptz not null
);
create table if not exists public.notion_portal_challenges (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  nonce text not null,
  expires_at timestamptz not null
);
create table if not exists public.notion_portal_audit (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.notion_portal_users(id),
  actor_id uuid references public.notion_portal_users(id),
  event text not null,
  occurred_at timestamptz not null default now()
);
create index if not exists notion_portal_sessions_expiry on public.notion_portal_sessions(expires_at);
create index if not exists notion_portal_sessions_user on public.notion_portal_sessions(user_id);
create index if not exists notion_portal_challenges_expiry on public.notion_portal_challenges(expires_at);
create index if not exists notion_portal_users_status on public.notion_portal_users(status, requested_at desc);
create index if not exists notion_portal_audit_user on public.notion_portal_audit(user_id, occurred_at desc);
alter table public.notion_portal_users enable row level security;
alter table public.notion_portal_sessions enable row level security;
alter table public.notion_portal_challenges enable row level security;
alter table public.notion_portal_audit enable row level security;
revoke all on public.notion_portal_users, public.notion_portal_sessions, public.notion_portal_challenges, public.notion_portal_audit from public, anon, authenticated;
revoke all on sequence public.notion_portal_audit_id_seq from public, anon, authenticated;
grant all on public.notion_portal_users, public.notion_portal_sessions, public.notion_portal_challenges, public.notion_portal_audit to service_role;
grant usage, select on sequence public.notion_portal_audit_id_seq to service_role;

-- Reserve FIRST approved account; real Google sign-in is still required.
insert into public.notion_portal_users(email, name, role, status, reviewed_at)
values ('avinash.damale@satgurutravel.com','Avinash Damale','super_admin','approved',now())
on conflict (email) do nothing;
insert into public.notion_portal_audit(user_id,event)
select id,'bootstrap_preapproved' from public.notion_portal_users u
where email='avinash.damale@satgurutravel.com'
and not exists (select 1 from public.notion_portal_audit a where a.user_id=u.id and a.event='bootstrap_preapproved');

create or replace function public.notion_portal_public_user(p_user public.notion_portal_users)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('id',(p_user).id,'email',(p_user).email,'name',(p_user).name,
    'role',(p_user).role,'status',(p_user).status,'requested_at',(p_user).requested_at,'reviewed_at',(p_user).reviewed_at);
$$;
create or replace function public.notion_portal_challenge(p_hash text,p_nonce text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if p_hash is null or p_nonce is null or p_hash !~ '^[0-9a-f]{64}$' or p_nonce !~ '^[A-Za-z0-9_-]{43}$' then raise exception 'invalid_challenge'; end if;
  delete from public.notion_portal_challenges where expires_at<=now();
  delete from public.notion_portal_sessions where expires_at<=now();
  insert into public.notion_portal_challenges values(p_hash,p_nonce,now()+interval '10 minutes');
  return '{}'::jsonb;
end;
$$;
create or replace function public.notion_portal_nonce(p_hash text)
returns text language sql stable security invoker set search_path = '' as $$
  select nonce from public.notion_portal_challenges where token_hash=p_hash and expires_at>now();
$$;
create or replace function public.notion_portal_login(
  p_challenge_hash text,p_nonce text,p_sub text,p_email text,p_name text,p_session_hash text,p_previous_hash text default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare u public.notion_portal_users; fresh boolean:=false;
begin
  if p_email is null or p_email<>lower(p_email) or p_email !~ '^[^[:space:]@]+@satgurutravel[.]com$'
    or p_sub is null or p_sub !~ '^[A-Za-z0-9_-]{1,255}$' then raise exception 'identity_conflict'; end if;
  -- Atomic one-use challenge consumption and session creation.
  delete from public.notion_portal_challenges where token_hash=p_challenge_hash and nonce=p_nonce and expires_at>now();
  if not found then raise exception 'invalid_challenge'; end if;
  if exists(select 1 from public.notion_portal_users where google_sub=p_sub and email<>p_email) then raise exception 'identity_conflict'; end if;
  select * into u from public.notion_portal_users where email=p_email for update;
  if not found then
    if p_email='avinash.damale@satgurutravel.com' then raise exception 'identity_conflict'; end if;
    insert into public.notion_portal_users(email,google_sub,name) values(p_email,p_sub,left(coalesce(p_name,p_email),150))
    on conflict(email) do nothing returning * into u;
    fresh:=found;
    if not fresh then select * into u from public.notion_portal_users where email=p_email for update; end if;
  end if;
  if u.google_sub is not null and u.google_sub<>p_sub then raise exception 'identity_conflict'; end if;
  update public.notion_portal_users set google_sub=p_sub,name=left(coalesce(p_name,p_email),150),last_login_at=now()
    where id=u.id returning * into u;
  if fresh then insert into public.notion_portal_audit(user_id,event) values(u.id,'access_requested'); end if;
  if p_previous_hash is not null then delete from public.notion_portal_sessions where token_hash=p_previous_hash; end if;
  insert into public.notion_portal_sessions values(p_session_hash,u.id,now()+interval '8 hours');
  return public.notion_portal_public_user(u);
exception when unique_violation then raise exception 'identity_conflict';
end;
$$;
create or replace function public.notion_portal_session(p_hash text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select public.notion_portal_public_user(u) from public.notion_portal_users u
  join public.notion_portal_sessions s on s.user_id=u.id where s.token_hash=p_hash and s.expires_at>now();
$$;
create or replace function public.notion_portal_logout(p_hash text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin delete from public.notion_portal_sessions where token_hash=p_hash; return '{}'::jsonb; end;
$$;
create or replace function public.notion_portal_list_users(p_actor uuid,p_page integer default 0)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare result jsonb;
begin
  if not exists(select 1 from public.notion_portal_users where id=p_actor and email='avinash.damale@satgurutravel.com'
    and role='super_admin' and status='approved') then raise exception 'admin_required'; end if;
  select jsonb_build_object(
    'total',(select count(*) from public.notion_portal_users),
    'pending',(select count(*) from public.notion_portal_users where status='pending'),
    'users',coalesce((select jsonb_agg(public.notion_portal_public_user(q::public.notion_portal_users)) from (
      select * from public.notion_portal_users order by (status='pending') desc,requested_at desc,id
      limit 50 offset greatest(0,least(p_page,100000))*50
    ) q),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;
create or replace function public.notion_portal_review(p_actor uuid,p_user uuid,p_action text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare u public.notion_portal_users; next_status text;
begin
  if not exists(select 1 from public.notion_portal_users where id=p_actor and email='avinash.damale@satgurutravel.com'
    and role='super_admin' and status='approved') then raise exception 'admin_required'; end if;
  select * into u from public.notion_portal_users where id=p_user for update;
  if not found then raise exception 'invalid_transition'; end if;
  if u.role='super_admin' then raise exception 'protected_admin'; end if;
  next_status:=case
    when p_action='approve' and u.status in ('pending','rejected','revoked') then 'approved'
    when p_action='reject' and u.status='pending' then 'rejected'
    when p_action='revoke' and u.status='approved' then 'revoked'
    else null end;
  if next_status is null then raise exception 'invalid_transition'; end if;
  update public.notion_portal_users set status=next_status,reviewed_at=now(),reviewed_by=p_actor where id=p_user returning * into u;
  insert into public.notion_portal_audit(user_id,actor_id,event) values(p_user,p_actor,p_action);
  if next_status<>'approved' then delete from public.notion_portal_sessions where user_id=p_user; end if;
  return public.notion_portal_public_user(u);
end;
$$;
-- Default PUBLIC function execution privileges must be removed explicitly.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and starts_with(p.proname,'notion_portal_')
  loop
    execute format('revoke all on function %s from public, anon, authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
commit;
