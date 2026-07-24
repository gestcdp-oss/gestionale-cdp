-- =====================================================================
-- GESTIONALE CDP — schema di sicurezza (whitelist + RLS)
-- Principio: NESSUN dato e leggibile senza login Google + email in whitelist.
-- Applicare con:  node scripts/run-sql.mjs --file supabase/schema.sql
-- =====================================================================

-- 1) Tabella whitelist ------------------------------------------------
create table if not exists public.utenti_autorizzati (
  id        uuid primary key default gen_random_uuid(),
  email     text not null unique,
  nome      text,
  ruolo     text not null default 'utente' check (ruolo in ('admin', 'utente')),
  attivo    boolean not null default true,
  creato_il timestamptz not null default now()
);

-- Normalizza l'email (minuscolo, senza spazi) su insert/update.
create or replace function public.norm_email() returns trigger
language plpgsql as $$
begin
  new.email := lower(trim(new.email));
  return new;
end;
$$;

drop trigger if exists trg_norm_email on public.utenti_autorizzati;
create trigger trg_norm_email before insert or update on public.utenti_autorizzati
  for each row execute function public.norm_email();

-- 2) Funzioni di sicurezza (SECURITY DEFINER) -------------------------
-- Email dell'utente corrente: prima dal claim JWT, in fallback da auth.users.
create or replace function public.email_corrente() returns text
language sql stable security definer set search_path = public, auth as $$
  select nullif(lower(coalesce(
    (auth.jwt() ->> 'email'),
    (select u.email from auth.users u where u.id = auth.uid())
  )), '');
$$;

create or replace function public.is_autorizzato() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.utenti_autorizzati ua
    where ua.email = public.email_corrente() and ua.attivo
  );
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.utenti_autorizzati ua
    where ua.email = public.email_corrente() and ua.attivo and ua.ruolo = 'admin'
  );
$$;

-- Profilo dell'utente corrente: usato dall'app per il gate whitelist.
-- SECURITY DEFINER -> restituisce SOLO la riga di chi chiama (non espone la lista).
create or replace function public.get_my_profile()
returns table (email text, nome text, ruolo text, attivo boolean)
language sql stable security definer set search_path = public as $$
  select ua.email, ua.nome, ua.ruolo, ua.attivo
  from public.utenti_autorizzati ua
  where ua.email = public.email_corrente() and ua.attivo;
$$;

-- 3) RLS sulla whitelist ---------------------------------------------
alter table public.utenti_autorizzati enable row level security;

drop policy if exists ua_select_admin on public.utenti_autorizzati;
create policy ua_select_admin on public.utenti_autorizzati
  for select using (public.is_admin());

drop policy if exists ua_modify_admin on public.utenti_autorizzati;
create policy ua_modify_admin on public.utenti_autorizzati
  for all using (public.is_admin()) with check (public.is_admin());

-- 4) Protezione dell'admin permanente --------------------------------
create or replace function public.proteggi_admin_permanente() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' and old.email = 'marabelli.s@gmail.com' then
    raise exception 'Admin permanente non eliminabile';
  end if;
  if tg_op = 'UPDATE' and old.email = 'marabelli.s@gmail.com'
     and (new.ruolo <> 'admin' or new.attivo = false or new.email <> old.email) then
    raise exception 'Admin permanente non modificabile';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_proteggi_admin on public.utenti_autorizzati;
create trigger trg_proteggi_admin before update or delete on public.utenti_autorizzati
  for each row execute function public.proteggi_admin_permanente();

-- 5) Seed admin permanente -------------------------------------------
insert into public.utenti_autorizzati (email, nome, ruolo, attivo)
values ('marabelli.s@gmail.com', 'Amministratore', 'admin', true)
on conflict (email) do update set ruolo = 'admin', attivo = true;

-- 6) GRANT espliciti (compat. con la Data API policy di Supabase) -----
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.utenti_autorizzati to authenticated;
grant execute on function public.get_my_profile() to authenticated;
grant execute on function public.is_autorizzato() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.email_corrente() to authenticated;

-- =====================================================================
-- REGOLA D'ORO — per OGNI tabella futura con dati dei fornitori:
--
--   alter table public.<tabella> enable row level security;
--   create policy <tabella>_sel on public.<tabella>
--     for select using (public.is_autorizzato());
--   create policy <tabella>_mod on public.<tabella>
--     for all using (public.is_autorizzato()) with check (public.is_autorizzato());
--   grant select, insert, update, delete on public.<tabella> to authenticated;
--
-- Senza RLS + policy la tabella e leggibile con la sola anon key: NON dimenticarlo.
-- (Con RLS attiva e nessuna policy, invece, la tabella e chiusa a tutti: sicuro.)
-- =====================================================================
