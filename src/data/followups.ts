import type { Appointment, Patient } from "./types";

/**
 * ติดตามผลหลังนวด — ผู้ป่วยที่ใช้แอปได้แจ้งเตือนให้ประเมินหลังนวด (ค่าเริ่ม 48 ชม.) ผลกลับมาที่นัดนั้น (appointment.followUp)
 * ใครต้องโทร: อาการแย่ลง · เลยกำหนดแล้วไม่ตอบ · ไม่ใช้แอป (ต้องโทรถามเอง)
 */
export type FollowState = "worse" | "overdue" | "noapp" | "waiting" | "ok";

export const FOLLOW_META: Record<FollowState, { label: string; tone: "danger" | "warning" | "info" | "neutral" | "success"; call: boolean }> = {
  worse: { label: "อาการแย่ลง · โทรกลับ", tone: "danger", call: true },
  overdue: { label: "ยังไม่ตอบ · ควรโทร", tone: "warning", call: true },
  noapp: { label: "ไม่ใช้แอป · โทรติดตาม", tone: "warning", call: true },
  waiting: { label: "รอผู้ป่วยตอบในแอป", tone: "info", call: false },
  ok: { label: "ตอบแล้ว · ไม่แย่ลง", tone: "success", call: false },
};

export interface FollowRow {
  a: Appointment;
  p: Patient;
  state: FollowState;
  /** ครบกำหนดติดตาม (ISO) */
  due: string;
}

/** นัดที่บันทึกการรักษาแล้วใน 14 วัน → สถานะติดตามผล */
export function followRows(appointments: Appointment[], patientById: (id: string) => Patient, hours = 48, now = Date.now()): FollowRow[] {
  const since = new Date(now - 14 * 864e5).toISOString().slice(0, 10);
  const rows: FollowRow[] = [];
  for (const a of appointments) {
    if (!a.recordedAt || a.date < since || a.status === "cancelled" || a.status === "absent") continue;
    const p = patientById(a.patientId);
    const due = new Date(new Date(a.recordedAt).getTime() + hours * 3600e3).toISOString();
    const fu = a.followUp;
    const worse = !!fu && (fu.worse || (a.painAfter !== undefined && fu.pain >= a.painAfter + 2));
    // ผู้ป่วยที่ไม่ได้มาจากแอป (ไม่มีนัดในคลาวด์) → ตอบในแอปไม่ได้ ต้องโทร
    const app = !!a.cloudId;
    const state: FollowState = fu ? (worse ? "worse" : "ok") : !app ? (now >= new Date(due).getTime() ? "noapp" : "waiting") : now >= new Date(due).getTime() + 24 * 3600e3 ? "overdue" : "waiting";
    rows.push({ a, p, state, due });
  }
  const rank: Record<FollowState, number> = { worse: 0, overdue: 1, noapp: 2, waiting: 3, ok: 4 };
  return rows.sort((x, y) => rank[x.state] - rank[y.state] || (y.a.recordedAt ?? "").localeCompare(x.a.recordedAt ?? ""));
}

/** ต้องโทรและยังไม่ได้โทร */
export const needsCall = (r: FollowRow) => FOLLOW_META[r.state].call && !r.a.followCall;
