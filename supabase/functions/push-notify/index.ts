// ThaiWell: ส่ง Web Push ไปทุกเครื่องของคลินิกที่อนุญาตแจ้งเตือน
// เรียกจาก trigger ในฐานข้อมูล (supabase/push.sql) · ตรวจ x-push-secret · ใช้กุญแจ VAPID จาก secrets
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY")!;
const PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
const SECRET = Deno.env.get("PUSH_SECRET")!;
webpush.setVapidDetails("mailto:clinic@thaiwell.app", PUBLIC, PRIVATE);
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const thaiDate = (iso: string) => {
  const m = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const [, mm, dd] = iso.split("-").map(Number);
  return `${dd} ${m[mm - 1]}`;
};

Deno.serve(async (req) => {
  if (req.headers.get("x-push-secret") !== SECRET) return new Response("forbidden", { status: 403 });
  const { type, record: r } = await req.json();
  const { data: p } = await db.from("tw_patients").select("name").eq("id", r.patient_id).maybeSingle();
  const who = p?.name ?? "ผู้ป่วย";
  const msg =
    type === "INSERT"
      ? { title: "คำขอจองใหม่", body: `${who} · ${thaiDate(r.date)} ${String(r.start).slice(0, 5)} น. · ${r.service ?? ""}`, link: "/requests" }
      : { title: "ผู้ป่วยยกเลิกนัด", body: `${who} · ${thaiDate(r.date)} ${String(r.start).slice(0, 5)} น.`, link: "/appointments" };
  const { data: subs } = await db.from("push_subscriptions").select("endpoint,p256dh,auth");
  let sent = 0;
  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ ...msg, tag: `tw-${r.id}` }), { TTL: 3600 });
        sent++;
      } catch (e) {
        // เครื่องเลิกรับแล้ว → ลบออก
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
      }
    }),
  );
  return Response.json({ sent });
});
