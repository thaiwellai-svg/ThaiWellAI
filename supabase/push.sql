-- ThaiWell: Web Push สำหรับเว็บคลินิก (รันใน Supabase → SQL Editor หลัง clinic-tables.sql)
-- 1) ตารางเก็บเครื่องที่รับแจ้งเตือน · เข้าถึงได้เฉพาะบัญชีคลินิก (is_clinic)
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  p256dh text not null,
  auth text not null,
  device text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists clinic_all on public.push_subscriptions;
create policy clinic_all on public.push_subscriptions for all to authenticated using (public.is_clinic()) with check (public.is_clinic());

-- 2) มีคำขอจองใหม่จากแอป / ผู้ป่วยยกเลิกนัด → เรียกฟังก์ชันส่ง push (pg_net)
create extension if not exists pg_net;
create or replace function public.push_on_booking() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT' and new.status = 'requested')
     or (tg_op = 'UPDATE' and new.status = 'cancelled' and old.status is distinct from 'cancelled' and coalesce(new.note, '') like '%ผู้ป่วย%') then
    perform net.http_post(
      url := 'https://mvwksnilprhpgdwpiyqu.supabase.co/functions/v1/push-notify',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', '__PUSH_SECRET__'),
      body := jsonb_build_object('type', tg_op, 'record', to_jsonb(new))
    );
  end if;
  return new;
end $$;
drop trigger if exists push_on_booking on public.tw_appointments;
create trigger push_on_booking after insert or update of status on public.tw_appointments
for each row execute function public.push_on_booking();
