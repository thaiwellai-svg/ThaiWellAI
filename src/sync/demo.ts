import { addISODays, fromISODate, todayISO } from "../data/thaiDate";
import { DEMO_PATIENT, DEMO_REFS } from "../data/seed";
import type { Appointment, Patient, Service, Therapist } from "../data/types";
import { cloud, logEvent } from "./cloud";

/**
 * ข้อมูลสาธิตชุดเดียวกันทั้ง 2 ระบบ (แอป ThaiWell AI ↔ หลังบ้าน)
 *   คุณสมศักดิ์ รักดี (บัญชีตัวอย่างในแอป) — นัดวันนี้ · บิลค้าง 400 บาท · นัดภูมิแพ้ครั้งถัดไป
 *   นางสาว ปิยะนุช ทดสอบแอป (แอปจำลองในหน้า /flow) — คำขอจองรออนุมัติ 1 รายการ
 * แถวใน Supabase สร้างจากนัดในหลังบ้าน (seed.ts) → วัน เวลา ผู้บำบัด ตรงกันเสมอ
 */
export const DEMO_APP_USER = { id: "app-demo-1", name: "นางสาว ปิยะนุช ทดสอบแอป", phone: "0899990001", gender: "หญิง", age: 34 };
const RESEED_KEY = "thaiwell.demo.reseed";

interface Ctx {
  appointments: Appointment[];
  patients: Patient[];
  serviceById: (id: string) => Service;
  therapistById: (id: string) => Therapist;
}

function rows(st: Ctx) {
  const a = (cid: string) => st.appointments.find((x) => x.cloudId === cid);
  const out: Record<string, unknown>[] = [];
  const base = (x: Appointment) => ({ id: x.cloudId, patient_id: DEMO_PATIENT.cloudId, service: st.serviceById(x.serviceId).name, date: x.date, start: x.start, therapist: st.therapistById(x.therapistId).name });
  const today = a(DEMO_REFS.officeToday);
  if (today && today.status === "waiting" && !today.calledAt)
    out.push({ ...base(today), status: "confirmed", assessment: { complaint: "ปวดคอ บ่า ไหล่ (ออฟฟิศซินโดรม)", pain: today.painBefore, areas: ["บ่าซ้าย", "คอ"], pressure: "ปานกลาง", conditions: ["ความดันโลหิตสูง"], summary: "ออฟฟิศซินโดรม ครั้งที่ 6/8 · จองในแอป" } });
  const bill = a(DEMO_REFS.lungBill);
  if (bill?.payment?.status === "pending")
    out.push({
      ...base(bill),
      status: "billed",
      record: { painBefore: bill.painBefore, painAfter: bill.painAfter, diagnoses: bill.diagnoses?.map((d) => d.name), procedures: bill.procedures?.map((p) => p.name), therapist: st.therapistById(bill.therapistId).name },
      bill: { amount: bill.payment.amount, items: ["นวดหน้า ศีรษะ ไหล่", "ลูกประคบสมุนไพร"], status: "pending", via: "app" },
    });
  const next = a(DEMO_REFS.lungNext);
  if (next && next.status === "waiting") out.push({ ...base(next), status: "confirmed", assessment: { complaint: "ภูมิแพ้ทางเดินหายใจ คัดจมูก ปวดขมับ", pain: next.painBefore, areas: ["ขมับซ้าย", "หน้า (ข้างจมูก)", "ไหล่ขวา"] } });
  // คำขอจองจากแอปจำลอง: วันทำการถัดไป 10:00
  let d = addISODays(todayISO(), 1);
  while (fromISODate(d).getDay() === 0) d = addISODays(d, 1);
  out.push({
    id: "tw-demo-request-1",
    patient_id: DEMO_APP_USER.id,
    status: "requested",
    service: "นวดไทยเพื่อการรักษา",
    date: d,
    start: "10:00",
    assessment: { complaint: "ปวดหลังส่วนล่าง ร้าวลงสะโพกซ้าย", pain: 7, areas: ["หลังส่วนล่าง", "สะโพกซ้าย"], avoid: [], conditions: [], pressure: "ปานกลาง", screening: { fever: false, highBP: false }, summary: "AI ประเมิน: ปวดหลังส่วนล่าง 7/10 · ไม่พบข้อห้าม" },
  });
  return out;
}

const PATIENTS = [
  { id: DEMO_PATIENT.cloudId, name: DEMO_PATIENT.name, phone: null, gender: "ชาย", age: 34, clinic_hn: "TW-000123" },
  { id: DEMO_APP_USER.id, name: DEMO_APP_USER.name, phone: DEMO_APP_USER.phone, gender: DEMO_APP_USER.gender, age: DEMO_APP_USER.age },
];

/** ล้าง cloud แล้วใส่ข้อมูลสาธิตชุดเดียวกับหลังบ้าน */
export async function resetDemoCloud(st: Ctx) {
  await cloud.from("tw_events").delete().gt("id", 0);
  await cloud.from("tw_appointments").delete().neq("id", "");
  await cloud.from("tw_patients").upsert(PATIENTS);
  await cloud.from("tw_appointments").insert(rows(st));
  await logEvent("system", "demo.reset", null, undefined, "เริ่มข้อมูลสาธิตใหม่ทั้ง 2 ระบบ");
}

/** ครั้งแรกที่เปิด (cloud ยังไม่มีแถวสาธิต) → ใส่ให้ · มีแล้วไม่แตะ */
export async function ensureDemoCloud(st: Ctx) {
  const want = rows(st);
  const { data, error } = await cloud.from("tw_appointments").select("id").in("id", want.map((r) => r.id as string));
  if (error) return;
  const have = new Set((data ?? []).map((r) => r.id as string));
  const missing = want.filter((r) => !have.has(r.id as string));
  if (!missing.length) return;
  await cloud.from("tw_patients").upsert(PATIENTS, { ignoreDuplicates: true });
  await cloud.from("tw_appointments").insert(missing);
}

/** ขอรีเซ็ตทั้ง 2 ระบบ: หลังบ้านเริ่มข้อมูลใหม่แล้วโหลดหน้าใหม่ → CloudBridge ใส่ข้อมูลชุดใหม่ลง cloud */
export const requestDemoReseed = () => {
  try {
    localStorage.setItem(RESEED_KEY, "1");
  } catch {
    /* storage unavailable */
  }
};
export const takeDemoReseed = () => {
  try {
    const on = localStorage.getItem(RESEED_KEY) === "1";
    localStorage.removeItem(RESEED_KEY);
    return on;
  } catch {
    return false;
  }
};

/* ── เวลาว่างจริงของคลินิก → แอปบนมือถือ (แถวเดียวใน tw_events id = -1 ไม่ต้องเพิ่มตาราง) ── */
let lastAvailability = "";
export async function publishCloudAvailability(raw: string | null) {
  if (!raw) return;
  const a = JSON.parse(raw) as { at: string };
  // เทียบเฉพาะเนื้อหา (ไม่นับเวลาที่ประกาศ) → ส่งเมื่อเวลาว่างเปลี่ยนจริง
  const key = JSON.stringify({ ...a, at: "" });
  if (key === lastAvailability) return;
  lastAvailability = key;
  await cloud.from("tw_events").upsert({ id: -1, source: "system", kind: "clinic.availability", summary: "เวลาว่างของคลินิก", payload: a });
}

/** รีเซ็ตข้อมูลสาธิตทั้ง 2 ระบบ: หลังบ้านเริ่มชุดใหม่ → โหลดหน้าใหม่ → cloud ได้ชุดเดียวกัน (แอปที่เปิดอยู่ปิดแล้วเปิดใหม่) */
export function resetBothSystems(dispatch: (a: { type: "reset" } | { type: "updateSettings"; patch: { clinicName: string } }) => void, clinicName: string) {
  requestDemoReseed();
  dispatch({ type: "reset" });
  dispatch({ type: "updateSettings", patch: { clinicName } });
  // รอให้ร้านค้าบันทึกลงเครื่องก่อนโหลดหน้าใหม่
  window.setTimeout(() => window.location.reload(), 500);
}
