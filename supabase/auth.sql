-- ThaiWell: บัญชีจริง + ข้อมูลจริง (รันต่อจาก schema.sql ใน Supabase → SQL Editor)
-- 1) ผู้ใช้แอปสมัครด้วยอีเมล → เห็น/แก้ได้เฉพาะข้อมูลของตัวเอง
-- 2) คลินิกล็อกอินด้วยบัญชีคลินิก (อีเมลในตาราง tw_clinic_accounts) → เห็นทุกอย่าง
-- 3) ข้อมูลระบบคลินิกทั้งหมดอยู่ในตาราง bo_store (แทนการเก็บในเครื่อง)
-- 4) เลิกสิทธิ์แบบเปิดทุกตาราง (prototype all) — ต้องเข้าสู่ระบบจึงอ่าน/เขียนได้
-- ไฟล์นี้ไม่ลบข้อมูลใด ๆ · ข้อมูลทดสอบเดิมลบเองได้ใน Table Editor

-- ---------- บัญชีคลินิก ----------
create table if not exists public.tw_clinic_accounts (
  email text primary key
);
insert into public.tw_clinic_accounts (email) values ('clinic@thaiwell.app') on conflict do nothing;

create or replace function public.is_clinic() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tw_clinic_accounts c where c.email = (auth.jwt() ->> 'email'));
$$;

-- ---------- ข้อมูลระบบคลินิก (ผู้ป่วย นัด บันทึก บิล ผู้บำบัด บริการ ตั้งค่า คลัง แพ็กเกจ ฯลฯ) ----------
create table if not exists public.bo_store (
  collection text not null,
  id text not null,
  data jsonb not null,
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (collection, id)
);

-- ---------- ผู้ใช้แอป ----------
alter table public.tw_patients add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table public.tw_patients add column if not exists email text;
alter table public.tw_patients add column if not exists citizen_id text;
alter table public.tw_patients add column if not exists title text;
alter table public.tw_patients add column if not exists birth_date text;
alter table public.tw_patients add column if not exists address text;
alter table public.tw_patients add column if not exists profile jsonb;
create unique index if not exists tw_patients_user on public.tw_patients (user_id);

-- ข้อมูลในแอปของแต่ละคน (เรื่องที่ประเมิน ใบการรักษา บิล แจ้งเตือน)
create table if not exists public.tw_app_state (
  user_id uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  state jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------- สิทธิ์ ----------
alter table public.tw_clinic_accounts enable row level security;
alter table public.bo_store enable row level security;
alter table public.tw_app_state enable row level security;

drop policy if exists "prototype all" on public.tw_patients;
drop policy if exists "prototype all" on public.tw_appointments;
drop policy if exists "prototype all" on public.tw_events;

-- คลินิก: ทุกตาราง
drop policy if exists clinic_all on public.bo_store;
create policy clinic_all on public.bo_store for all to authenticated using (public.is_clinic()) with check (public.is_clinic());
drop policy if exists clinic_all on public.tw_patients;
create policy clinic_all on public.tw_patients for all to authenticated using (public.is_clinic()) with check (public.is_clinic());
drop policy if exists clinic_all on public.tw_appointments;
create policy clinic_all on public.tw_appointments for all to authenticated using (public.is_clinic()) with check (public.is_clinic());
drop policy if exists clinic_all on public.tw_events;
create policy clinic_all on public.tw_events for all to authenticated using (public.is_clinic()) with check (public.is_clinic());
drop policy if exists clinic_read on public.tw_clinic_accounts;
create policy clinic_read on public.tw_clinic_accounts for select to authenticated using (public.is_clinic());

-- ผู้ใช้แอป: เฉพาะของตัวเอง (tw_patients.id = user id ของบัญชี)
drop policy if exists own_patient on public.tw_patients;
create policy own_patient on public.tw_patients for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and id = auth.uid()::text);
drop policy if exists own_appts on public.tw_appointments;
create policy own_appts on public.tw_appointments for all to authenticated
  using (patient_id = auth.uid()::text) with check (patient_id = auth.uid()::text);
drop policy if exists own_state on public.tw_app_state;
create policy own_state on public.tw_app_state for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- เหตุการณ์: แอปเขียนของตัวเองได้ · อ่านของนัดตัวเอง + เวลาว่างของคลินิก (id = -1)
drop policy if exists app_events_insert on public.tw_events;
create policy app_events_insert on public.tw_events for insert to authenticated
  with check (source = 'app' and (appointment_id is null or exists (select 1 from public.tw_appointments a where a.id = appointment_id and a.patient_id = auth.uid()::text)));
drop policy if exists app_events_read on public.tw_events;
create policy app_events_read on public.tw_events for select to authenticated
  using (id = -1 or exists (select 1 from public.tw_appointments a where a.id = appointment_id and a.patient_id = auth.uid()::text));

-- realtime ของตารางใหม่
do $$ begin
  begin alter publication supabase_realtime add table public.bo_store; exception when duplicate_object then null; end;
end $$;
