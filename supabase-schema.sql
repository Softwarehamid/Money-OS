create table if not exists public.moneyos_state (
  id text primary key,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.moneyos_state enable row level security;

drop policy if exists "Users can read their MoneyOS state" on public.moneyos_state;
create policy "Users can read their MoneyOS state"
on public.moneyos_state
for select
using (auth.uid()::text = id);

drop policy if exists "Users can create their MoneyOS state" on public.moneyos_state;
create policy "Users can create their MoneyOS state"
on public.moneyos_state
for insert
with check (auth.uid()::text = id);

drop policy if exists "Users can update their MoneyOS state" on public.moneyos_state;
create policy "Users can update their MoneyOS state"
on public.moneyos_state
for update
using (auth.uid()::text = id)
with check (auth.uid()::text = id);

drop policy if exists "Users can delete their MoneyOS state" on public.moneyos_state;
create policy "Users can delete their MoneyOS state"
on public.moneyos_state
for delete
using (auth.uid()::text = id);
