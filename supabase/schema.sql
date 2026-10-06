-- ThaiWell prototype: shared data between the patient app and the clinic back-office.
-- PROTOTYPE ONLY: the anon/publishable key may read and write these tables (no logins yet).
-- Use demo data only — never real patient data — until auth + per-user policies are added.

create table if not exists public.tw_patients (
  id          text primary key,              -- app account id
  name        text not null,
  phone       text,
  gender      text,
  age         int,
  clinic_hn   text,                          -- filled in when the clinic links / registers the patient
  created_at  timestamptz not null default now()
);

create table if not exists public.tw_appointments (
  id          text primary key,
  patient_id  text not null references public.tw_patients(id) on delete cascade,
  -- requested → confirmed → checked_in → called → in_service → recorded → billed → paid → closed
  -- side exits: rejected · cancelled · no_show
  status      text not null default 'requested',
  service     text,
  date        date,
  start       text,                          -- "HH:mm"
  therapist   text,
  queue_no    text,
  assessment  jsonb,                         -- from the app: complaint, pain, areas, safety answers
  record      jsonb,                         -- from the clinic: findings, diagnoses, procedures, pain before/after, advice
  bill        jsonb,                         -- amount, items, method, status, receipt_no, paid_at
  plan        jsonb,                         -- treatment plan approved by the Thai traditional doctor
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- every hand-off between the two apps, for the live Flow Monitor
create table if not exists public.tw_events (
  id              bigserial primary key,
  at              timestamptz not null default now(),
  source          text not null,             -- 'app' | 'clinic' | 'system'
  kind            text not null,             -- e.g. booking.requested, booking.confirmed, queue.called, bill.paid
  appointment_id  text,
  patient_name    text,
  summary         text,
  payload         jsonb
);

create or replace function public.tw_touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists tw_appointments_touch on public.tw_appointments;
create trigger tw_appointments_touch before update on public.tw_appointments
  for each row execute function public.tw_touch();

-- prototype access for the anon/publishable key
alter table public.tw_patients     enable row level security;
alter table public.tw_appointments enable row level security;
alter table public.tw_events       enable row level security;
drop policy if exists "prototype all" on public.tw_patients;
drop policy if exists "prototype all" on public.tw_appointments;
drop policy if exists "prototype all" on public.tw_events;
create policy "prototype all" on public.tw_patients     for all to anon, authenticated using (true) with check (true);
create policy "prototype all" on public.tw_appointments for all to anon, authenticated using (true) with check (true);
create policy "prototype all" on public.tw_events       for all to anon, authenticated using (true) with check (true);

-- live updates to both apps
do $$ begin
  begin alter publication supabase_realtime add table public.tw_appointments; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.tw_events;       exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.tw_patients;     exception when duplicate_object then null; end;
end $$;
