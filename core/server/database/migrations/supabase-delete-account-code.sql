-- Run in the Supabase SQL editor.
-- Verifies the 8-digit reauthentication code emailed for account deletion.
-- Does not expose codes to the browser. Clients cannot read this table.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.account_delete_code_attempts (
    user_id uuid primary key references auth.users (id) on delete cascade,
    attempts integer not null default 0,
    updated_at timestamptz not null default now()
);

alter table public.account_delete_code_attempts enable row level security;

revoke all on table public.account_delete_code_attempts from public, anon, authenticated;

create or replace function public.verify_delete_account_code(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
    v_email text;
    v_stored text;
    v_sent_at timestamptz;
    v_attempts integer := 0;
    v_attempt_at timestamptz;
    v_hash_sha224 text;
    v_hash_sha256 text;
    v_hash_sha224_lower text;
    v_hash_sha256_lower text;
    v_ok boolean := false;
begin
    if v_uid is null then
        raise exception 'not signed in';
    end if;

    if p_code is null or p_code !~ '^\d{8}$' then
        return false;
    end if;

    select u.email, u.reauthentication_token, u.reauthentication_sent_at
    into v_email, v_stored, v_sent_at
    from auth.users as u
    where u.id = v_uid;

    if v_email is null or v_email = '' or v_stored is null or v_stored = '' or v_sent_at is null then
        return false;
    end if;

    if v_sent_at < now() - interval '10 minutes' then
        return false;
    end if;

    select a.attempts, a.updated_at
    into v_attempts, v_attempt_at
    from public.account_delete_code_attempts as a
    where a.user_id = v_uid;

    if v_attempt_at is not null and v_attempt_at < v_sent_at then
        v_attempts := 0;
    end if;

    v_attempts := coalesce(v_attempts, 0) + 1;

    insert into public.account_delete_code_attempts (user_id, attempts, updated_at)
    values (v_uid, v_attempts, now())
    on conflict (user_id) do update
    set attempts = excluded.attempts,
        updated_at = excluded.updated_at;

    if v_attempts > 5 then
        return false;
    end if;

    v_hash_sha224 := encode(extensions.digest(convert_to(v_email || p_code, 'UTF8'), 'sha224'), 'hex');
    v_hash_sha256 := encode(extensions.digest(convert_to(v_email || p_code, 'UTF8'), 'sha256'), 'hex');
    v_hash_sha224_lower := encode(extensions.digest(convert_to(lower(v_email) || p_code, 'UTF8'), 'sha224'), 'hex');
    v_hash_sha256_lower := encode(extensions.digest(convert_to(lower(v_email) || p_code, 'UTF8'), 'sha256'), 'hex');

    v_ok := v_stored in (v_hash_sha224, v_hash_sha256, v_hash_sha224_lower, v_hash_sha256_lower);

    if not v_ok then
        return false;
    end if;

    update auth.users
    set reauthentication_token = '',
        reauthentication_sent_at = null
    where id = v_uid;

    delete from public.account_delete_code_attempts where user_id = v_uid;
    return true;
end;
$$;

revoke all on function public.verify_delete_account_code(text) from public, anon;
grant execute on function public.verify_delete_account_code(text) to authenticated;
