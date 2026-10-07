import { LIVE } from "./mode";
import type { Appointment, BookingRequest, Intake, Patient, Screening } from "./types";

/** small deterministic hash so a patient's demo answers stay the same between renders */
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const pick = <T,>(xs: readonly T[], h: number, salt = 0) => xs[(h + salt * 7919) % xs.length];

const AREA_RULES: [string, string[]][] = [
  ["คอ", ["คอ", "บ่า"]],
  ["บ่า", ["บ่า", "ไหล่"]],
  ["ไหล่", ["ไหล่", "หลังส่วนบน"]],
  ["หลัง", ["หลังส่วนล่าง", "สะโพก"]],
  ["เอว", ["หลังส่วนล่าง"]],
  ["เข่า", ["เข่า", "ขา"]],
  ["ขา", ["ขา"]],
  ["เท้า", ["เท้า"]],
  ["ศีรษะ", ["ศีรษะ", "คอ"]],
  ["มือ", ["แขน"]],
];
const OCCUPATIONS = ["นั่งหน้าคอมพิวเตอร์วันละ 8–10 ชั่วโมง", "ยืนทำงานเกือบทั้งวัน", "ขับรถวันละ 3–4 ชั่วโมง", "ยกของหนักเป็นประจำ", "งานบ้าน / ดูแลหลาน", "เกษียณ · เดินออกกำลังตอนเช้า"] as const;
const DURATIONS = ["ประมาณ 3 วัน", "ประมาณ 1 สัปดาห์", "ประมาณ 2 สัปดาห์", "ประมาณ 1 เดือน", "มากกว่า 3 เดือน"] as const;
const HISTORY = ["เคยนวดไทยและอโรม่า ไม่มีอาการผิดปกติ", "นวดไทยเป็นประจำเดือนละครั้ง", "ไม่เคยนวดมาก่อน", "เคยนวดแล้วระบมเล็กน้อย 1 วัน"] as const;
const AVOID = [[], [], ["เอวส่วนล่าง"], ["ท้อง"], ["ฝ่าเท้า"]] as const;
const MEDS: [string, string][] = [
  ["ความดัน", "ยาควบคุมความดัน"],
  ["เบาหวาน", "ยาเบาหวาน"],
  ["ไขมัน", "ยาลดไขมัน"],
  ["หัวใจ", "ยาต้านเกล็ดเลือด"],
];

/** demo answers derived from what the clinic already knows about the patient */
export function demoIntake(p: Patient, pain: number, screening: Screening | undefined, at: string): Intake {
  const h = hash(p.id);
  const areas = [...new Set(AREA_RULES.filter(([k]) => p.complaint.includes(k)).flatMap(([, a]) => a))];
  const meds = MEDS.filter(([k]) => p.conditions.some((c) => c.includes(k))).map(([, m]) => m);
  const sys = screening?.bpSystolic ?? 112 + (h % 24);
  return {
    at,
    goal: pain >= 5 ? "ลดอาการปวดเมื่อย" : pick(["ผ่อนคลาย / ลดอาการปวดเมื่อย", "ผ่อนคลายความเครียด", "ดูแลสุขภาพต่อเนื่อง"], h),
    complaint: p.complaint,
    pain,
    duration: pick(DURATIONS, h, 1),
    focusAreas: areas.length ? areas.slice(0, 4) : ["คอ", "บ่า", "ไหล่"],
    avoidAreas: [...pick(AVOID, h, 2)],
    occupation: pick(OCCUPATIONS, h, 3),
    conditions: p.conditions,
    surgery: screening?.recentSurgery ? "ผ่าตัดภายใน 30 วัน" : undefined,
    injury: undefined,
    medications: meds,
    bloodThinner: meds.includes("ยาต้านเกล็ดเลือด"),
    allergy: h % 5 === 0 ? "แพ้ยาหม่อง / น้ำมันกลิ่นแรง" : undefined,
    skin: "ปกติ ไม่มีแผล",
    numbness: p.complaint.includes("ชา"),
    fever: !!screening?.fever,
    pregnant: p.gender === "หญิง" ? !!screening?.pregnant : null,
    bp: { sys, dia: Math.round(sys * 0.62) },
    pulse: 68 + (h % 16),
    pressure: pick(["เบา", "ปานกลาง", "ปานกลาง", "หนัก"] as const, h, 4),
    history: pick(HISTORY, h, 5),
  };
}

/** the clinic's reference example (as the app sends it) — used for demo request r1 */
export const SAMPLE_INTAKE: Omit<Intake, "at"> = {
  goal: "ผ่อนคลาย / ลดอาการปวดเมื่อย",
  complaint: "ปวดคอ บ่า ไหล่",
  pain: 6,
  duration: "ประมาณ 2 สัปดาห์",
  focusAreas: ["คอ", "บ่า", "ไหล่", "หลังส่วนบน"],
  avoidAreas: ["เอวส่วนล่าง"],
  occupation: "นั่งหน้าคอมพิวเตอร์วันละ 8–10 ชั่วโมง",
  conditions: ["ความดันโลหิตสูง"],
  surgery: undefined,
  injury: undefined,
  medications: ["ยาควบคุมความดัน"],
  bloodThinner: false,
  allergy: undefined,
  skin: "ปกติ ไม่มีแผล",
  numbness: false,
  fever: false,
  pregnant: null,
  bp: { sys: 132, dia: 82 },
  pulse: 76,
  pressure: "ปานกลาง",
  history: "เคยนวดไทยและอโรม่า ไม่มีอาการผิดปกติ",
};

/** the assessment that came with a booking request (or its demo stand-in) */
export function intakeOfRequest(r: BookingRequest, p: Patient): Intake {
  if (r.intake) return r.intake;
  if (r.id === "r1") return { ...SAMPLE_INTAKE, at: r.submittedAt };
  return demoIntake(p, r.painScore, r.screening, r.submittedAt);
}

/** the assessment for a visit — walk-ins never filled one in */
export function intakeOfVisit(a: Appointment, p: Patient): Intake | null {
  // ผลประเมินของนัดนี้ (รอบล่าสุดที่ผู้ป่วยส่งมาสำหรับวันนัดนี้)
  const r = a.assessRounds?.[a.assessRounds.length - 1];
  if (a.intake && (!r || r.at <= a.intake.at)) return a.intake;
  if (r)
    return {
      ...(a.intake ?? { goal: "บรรเทาอาการ", duration: "-", conditions: p.conditions, medications: [], bloodThinner: false, skin: "ปกติ", numbness: false, fever: false, pregnant: null, pressure: "ปานกลาง" as const }),
      at: r.at,
      complaint: r.complaint || a.intake?.complaint || p.complaint,
      pain: r.pain,
      focusAreas: r.focusAreas.length ? r.focusAreas : (a.intake?.focusAreas ?? []),
      avoidAreas: r.avoidAreas.length ? r.avoidAreas : (a.intake?.avoidAreas ?? []),
    };
  if (a.intake) return a.intake;
  // ใช้งานจริง: ยังไม่ได้ประเมินสำหรับนัดนี้ = ไม่มี (ไม่สร้างข้อมูลแทน)
  if (LIVE) return null;
  if (a.type !== "booked") return null;
  const at = new Date(`${a.date}T${a.start}:00`);
  at.setDate(at.getDate() - 1);
  return demoIntake(p, a.painBefore, undefined, at.toISOString());
}

/** what needs the therapist's attention before touching the patient */
export function intakeAlerts(i: Intake, bpThreshold = 160): { label: string; level: "stop" | "warn" }[] {
  const out: { label: string; level: "stop" | "warn" }[] = [];
  if (i.fever) out.push({ label: "มีไข้ / การติดเชื้อ", level: "stop" });
  if (i.bp && i.bp.sys >= bpThreshold) out.push({ label: `ความดันสูง ${i.bp.sys}/${i.bp.dia}`, level: "stop" });
  if (i.pregnant) out.push({ label: "ตั้งครรภ์", level: "warn" });
  if (i.bloodThinner) out.push({ label: "ใช้ยาเพิ่มความเสี่ยงเลือดออก · ลดแรงนวด", level: "warn" });
  if (i.numbness) out.push({ label: "มีอาการชา / อ่อนแรง", level: "warn" });
  if (i.surgery) out.push({ label: i.surgery, level: "warn" });
  if (i.allergy) out.push({ label: i.allergy, level: "warn" });
  return out;
}
