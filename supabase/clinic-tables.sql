-- ThaiWell: ตารางเก็บข้อมูลระบบคลินิก แยกตามประเภท (รันต่อจาก auth.sql ใน Supabase → SQL Editor)
-- ทุกตาราง: id + data (ข้อมูลครบทุกช่องของระบบ) + คอลัมน์ที่อ่านง่ายดึงจาก data อัตโนมัติ (ดูใน Table Editor ได้เลย)
-- เข้าถึงได้เฉพาะบัญชีคลินิก (is_clinic) · อัปเดตสดข้ามเครื่อง (realtime)

create or replace function public.tw_make_clinic_table(t text, cols text, note text) returns void
language plpgsql as $$
begin
  execute format('create table if not exists public.%I (id text primary key, data jsonb not null, updated_by text, updated_at timestamptz not null default now()%s)', t, cols);
  execute format('comment on table public.%I is %L', t, note);
  execute format('alter table public.%I enable row level security', t);
  execute format('drop policy if exists clinic_all on public.%I', t);
  execute format('create policy clinic_all on public.%I for all to authenticated using (public.is_clinic()) with check (public.is_clinic())', t);
  begin
    execute format('alter publication supabase_realtime add table public.%I', t);
  exception when duplicate_object then null;
  end;
end $$;

select public.tw_make_clinic_table('clinic_patients', $c$,
  hn text generated always as (data->>'hn') stored,
  name text generated always as (data->>'name') stored,
  citizen_id text generated always as (data->>'citizenId') stored,
  phone text generated always as (data->>'phone') stored,
  gender text generated always as (data->>'gender') stored,
  age int generated always as ((data->>'age')::int) stored,
  birth_date text generated always as (data->>'birthDate') stored,
  address text generated always as (data->>'address') stored,
  course text generated always as (data->'course'->>'name') stored,
  app_user text generated always as (data->>'cloudId') stored
$c$, 'ผู้ป่วย / ผู้รับบริการ');

select public.tw_make_clinic_table('clinic_appointments', $c$,
  patient_id text generated always as (data->>'patientId') stored,
  appt_date text generated always as (data->>'date') stored,
  start_time text generated always as (data->>'start') stored,
  status text generated always as (data->>'status') stored,
  service_id text generated always as (data->>'serviceId') stored,
  therapist_id text generated always as (data->>'therapistId') stored,
  pain_before int generated always as ((data->>'painBefore')::int) stored,
  pain_after int generated always as ((data->>'painAfter')::int) stored,
  payment_status text generated always as (data->'payment'->>'status') stored,
  payment_method text generated always as (data->'payment'->>'method') stored,
  amount numeric generated always as ((data->'payment'->>'amount')::numeric) stored,
  receipt_no text generated always as (data->'payment'->>'no') stored,
  app_booking text generated always as (data->>'cloudId') stored
$c$, 'นัด / การรับบริการ / บันทึกการรักษา / การชำระเงิน');

select public.tw_make_clinic_table('clinic_requests', $c$,
  patient_id text generated always as (data->>'patientId') stored,
  req_date text generated always as (data->>'date') stored,
  start_time text generated always as (data->>'start') stored,
  service_id text generated always as (data->>'serviceId') stored,
  pain int generated always as ((data->>'painScore')::int) stored,
  submitted_at text generated always as (data->>'submittedAt') stored,
  app_booking text generated always as (data->>'cloudId') stored
$c$, 'คำขอจองรออนุมัติ');

select public.tw_make_clinic_table('clinic_decisions', $c$,
  outcome text generated always as (data->>'outcome') stored,
  patient_id text generated always as (data->'request'->>'patientId') stored,
  decided_at text generated always as (data->>'decidedAt') stored,
  decided_by text generated always as (data->>'decidedBy') stored,
  reason text generated always as (data->>'reason') stored
$c$, 'ผลการพิจารณาคำขอจอง (อนุมัติ / ปฏิเสธ)');

select public.tw_make_clinic_table('clinic_notifications', $c$,
  kind text generated always as (data->>'kind') stored,
  title text generated always as (data->>'title') stored,
  body text generated always as (data->>'body') stored,
  at_time text generated always as (data->>'at') stored,
  is_read boolean generated always as ((data->>'read')::boolean) stored
$c$, 'แจ้งเตือนในระบบคลินิก');

select public.tw_make_clinic_table('clinic_therapists', $c$,
  name text generated always as (data->>'name') stored,
  role text generated always as (data->>'role') stored,
  phone text generated always as (data->>'phone') stored
$c$, 'ผู้บำบัด / แพทย์แผนไทย (ตารางเวร บริการที่รับ วันลา อยู่ใน data)');

select public.tw_make_clinic_table('clinic_services', $c$,
  name text generated always as (data->>'name') stored,
  minutes int generated always as ((data->>'minutes')::int) stored,
  price numeric generated always as ((data->>'price')::numeric) stored
$c$, 'บริการและราคา');

select public.tw_make_clinic_table('clinic_audit', $c$,
  at_time text generated always as (data->>'at') stored,
  by_user text generated always as (data->>'by') stored,
  category text generated always as (data->>'cat') stored,
  detail text generated always as (data->>'text') stored,
  patient_id text generated always as (data->>'patientId') stored
$c$, 'ประวัติการแก้ไขข้อมูล (ใคร ทำอะไร เมื่อไหร่)');

select public.tw_make_clinic_table('clinic_stock_items', $c$,
  name text generated always as (data->>'name') stored,
  unit text generated always as (data->>'unit') stored,
  stock numeric generated always as ((data->>'stock')::numeric) stored,
  min_stock numeric generated always as ((data->>'min')::numeric) stored,
  cost numeric generated always as ((data->>'cost')::numeric) stored
$c$, 'สินค้าในคลัง');

select public.tw_make_clinic_table('clinic_stock_moves', $c$,
  at_time text generated always as (data->>'at') stored,
  item_id text generated always as (data->>'itemId') stored,
  qty numeric generated always as ((data->>'qty')::numeric) stored,
  kind text generated always as (data->>'kind') stored,
  by_user text generated always as (data->>'by') stored
$c$, 'รับเข้า / ใช้ / ปรับยอด สินค้าในคลัง');

select public.tw_make_clinic_table('clinic_packages', $c$,
  name text generated always as (data->>'name') stored,
  service_id text generated always as (data->>'serviceId') stored,
  sessions int generated always as ((data->>'sessions')::int) stored,
  price numeric generated always as ((data->>'price')::numeric) stored,
  active boolean generated always as ((data->>'active')::boolean) stored
$c$, 'แพ็กเกจ / คอร์สที่ขาย');

select public.tw_make_clinic_table('clinic_package_sales', $c$,
  no text generated always as (data->>'no') stored,
  at_time text generated always as (data->>'at') stored,
  patient_id text generated always as (data->>'patientId') stored,
  package_name text generated always as (data->>'name') stored,
  net numeric generated always as ((data->>'net')::numeric) stored
$c$, 'การขายแพ็กเกจ (มัดจำ / ชำระครบ)');

select public.tw_make_clinic_table('clinic_day_closings', $c$,
  close_date text generated always as (data->>'date') stored,
  by_user text generated always as (data->>'by') stored,
  expected_cash numeric generated always as ((data->>'expectedCash')::numeric) stored,
  counted numeric generated always as ((data->>'counted')::numeric) stored,
  diff numeric generated always as ((data->>'diff')::numeric) stored
$c$, 'ปิดยอดประจำวัน');

select public.tw_make_clinic_table('clinic_waitlist', $c$,
  patient_id text generated always as (data->>'patientId') stored,
  wait_date text generated always as (data->>'date') stored,
  status text generated always as (data->>'status') stored
$c$, 'รายชื่อรอคิวว่าง');

select public.tw_make_clinic_table('clinic_documents', $c$,
  no text generated always as (data->>'no') stored,
  kind text generated always as (data->>'kind') stored,
  at_time text generated always as (data->>'at') stored,
  patient_id text generated always as (data->>'patientId') stored
$c$, 'ใบรับรองแพทย์ / ใบส่งตัว ที่ออกแล้ว');

select public.tw_make_clinic_table('clinic_config', '', 'ตั้งค่าคลินิก (settings) · อัตราค่ามือ · วัสดุที่ใช้ต่อบริการ · เลขที่เอกสาร');
