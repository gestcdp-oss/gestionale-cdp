-- Modulo Immobili: anagrafica base degli immobili gestiti.
-- Ogni immobile e identificato dal numero Asset (univoco), che nei fogli
-- di attivita compare anche come COD. AGGREGATO.

create table if not exists public.immobili (
  id             uuid primary key default gen_random_uuid(),
  asset          text not null,          -- numero Asset / COD. AGGREGATO (univoco)
  denominazione  text not null,          -- nome immobile (univoco)
  portafoglio    text,                   -- portafoglio di appartenenza
  localizzazione text,                   -- localizzazione (indirizzo/area/regione)
  creato_il      timestamptz not null default now(),
  aggiornato_il  timestamptz not null default now()
);

-- Normalizza i campi (trim; vuoto -> NULL) e aggiorna aggiornato_il.
create or replace function public.immobili_normalizza() returns trigger
language plpgsql as $$
begin
  new.asset          := nullif(btrim(new.asset), '');
  new.denominazione  := nullif(btrim(new.denominazione), '');
  new.portafoglio    := nullif(btrim(new.portafoglio), '');
  new.localizzazione := nullif(btrim(new.localizzazione), '');
  new.aggiornato_il  := now();
  return new;
end;
$$;

drop trigger if exists trg_immobili_norm on public.immobili;
create trigger trg_immobili_norm before insert or update on public.immobili
  for each row execute function public.immobili_normalizza();

-- Univocita case-insensitive di Asset e Denominazione.
create unique index if not exists immobili_asset_uidx on public.immobili (lower(asset));
create unique index if not exists immobili_denom_uidx on public.immobili (lower(denominazione));

-- RLS: leggibile/scrivibile SOLO dagli utenti autorizzati (whitelist).
alter table public.immobili enable row level security;

drop policy if exists immobili_sel on public.immobili;
create policy immobili_sel on public.immobili
  for select using (public.is_autorizzato());

drop policy if exists immobili_mod on public.immobili;
create policy immobili_mod on public.immobili
  for all using (public.is_autorizzato()) with check (public.is_autorizzato());

grant select, insert, update, delete on public.immobili to authenticated;
