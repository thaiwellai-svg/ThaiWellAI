import { birthElement, birthMonthOf, type Element } from "./elements";
import type { Appointment, Patient, Service } from "./types";

/**
 * Real-world outcomes from the clinic's own records: pain before → after every finished visit.
 * Δ ≥ 2 points on the 0–10 scale is treated as a clinically meaningful change (common MCID for NRS pain).
 */
export const MCID = 2;

export const COMPLAINT_GROUPS: { key: string; label: string; kw: string[] }[] = [
  { key: "neck", label: "คอ บ่า ไหล่", kw: ["คอ", "บ่า", "ไหล่", "สะบัก"] },
  { key: "back", label: "หลัง เอว", kw: ["หลัง", "เอว", "สะโพก"] },
  { key: "knee", label: "เข่า ขา เท้า", kw: ["เข่า", "ขา", "น่อง", "เท้า", "ส้น", "รองช้ำ"] },
  { key: "head", label: "ศีรษะ", kw: ["ศีรษะ", "หัว", "ไมเกรน", "เวียน"] },
  { key: "sleep", label: "นอนไม่หลับ / เครียด", kw: ["นอน", "เครียด", "อ่อนเพลีย"] },
];
export const complaintGroup = (text: string) => COMPLAINT_GROUPS.find((g) => g.kw.some((k) => text.includes(k)))?.key ?? "other";
export const groupLabel = (key: string) => COMPLAINT_GROUPS.find((g) => g.key === key)?.label ?? "อื่น ๆ";

export interface OutcomeRow {
  a: Appointment;
  p: Patient;
  element: Element;
  group: string;
  before: number;
  after: number;
  delta: number;
}

export function outcomeRows(appointments: Appointment[], patients: Patient[], from?: string): OutcomeRow[] {
  const byId = new Map(patients.map((p) => [p.id, p]));
  const rows: OutcomeRow[] = [];
  for (const a of appointments) {
    if (a.status !== "done" || a.painAfter === undefined) continue;
    if (from && a.date < from) continue;
    const p = byId.get(a.patientId);
    if (!p) continue;
    rows.push({ a, p, element: birthElement(birthMonthOf(p)), group: complaintGroup(p.complaint), before: a.painBefore, after: a.painAfter, delta: a.painBefore - a.painAfter });
  }
  return rows;
}

export interface Summary {
  n: number;
  mean: number;
  /** 95% confidence interval of the mean Δ */
  lo: number;
  hi: number;
  before: number;
  after: number;
  /** share with Δ ≥ MCID */
  improved: number;
  /** share with ≥ 30% pain reduction */
  pct30: number;
}

export function summarize(rows: OutcomeRow[]): Summary {
  const n = rows.length;
  if (!n) return { n: 0, mean: 0, lo: 0, hi: 0, before: 0, after: 0, improved: 0, pct30: 0 };
  const mean = rows.reduce((s, r) => s + r.delta, 0) / n;
  const sd = n > 1 ? Math.sqrt(rows.reduce((s, r) => s + (r.delta - mean) ** 2, 0) / (n - 1)) : 0;
  const half = n > 1 ? (1.96 * sd) / Math.sqrt(n) : 0;
  return {
    n,
    mean,
    lo: mean - half,
    hi: mean + half,
    before: rows.reduce((s, r) => s + r.before, 0) / n,
    after: rows.reduce((s, r) => s + r.after, 0) / n,
    improved: rows.filter((r) => r.delta >= MCID).length / n,
    pct30: rows.filter((r) => r.before > 0 && r.delta / r.before >= 0.3).length / n,
  };
}

export function groupRows<K extends string>(rows: OutcomeRow[], key: (r: OutcomeRow) => K) {
  const m = new Map<K, OutcomeRow[]>();
  for (const r of rows) {
    const k = key(r);
    m.set(k, [...(m.get(k) ?? []), r]);
  }
  return m;
}

/** mean pain before each visit by visit number (1st, 2nd, …) — how pain falls over a course */
export function sessionCurve(rows: OutcomeRow[], max = 8) {
  const byP = groupRows(rows, (r) => r.p.id);
  const pts: { n: number; mean: number; count: number }[] = [];
  for (let i = 0; i < max; i++) {
    const vals: number[] = [];
    for (const list of byP.values()) {
      const s = [...list].sort((x, y) => (x.a.date + x.a.start).localeCompare(y.a.date + y.a.start));
      if (s[i]) vals.push(s[i].before);
    }
    if (vals.length >= 3) pts.push({ n: i + 1, mean: vals.reduce((a, b) => a + b, 0) / vals.length, count: vals.length });
  }
  return pts;
}

/** plain-language findings: element × service combinations that stand out from the clinic average */
export function findings(rows: OutcomeRow[], services: Service[], minN = 6) {
  const all = summarize(rows);
  const out: { tone: "good" | "bad"; text: string; diff: number; n: number }[] = [];
  const cells = groupRows(rows, (r) => `${r.element}|${r.a.serviceId}` as string);
  for (const [k, list] of cells) {
    if (list.length < minN) continue;
    const s = summarize(list);
    const diff = s.mean - all.mean;
    if (Math.abs(diff) < 0.6) continue;
    const [el, sid] = k.split("|");
    const svc = services.find((x) => x.id === sid)?.name ?? sid;
    out.push({
      tone: diff > 0 ? "good" : "bad",
      diff,
      n: list.length,
      text:
        diff > 0
          ? `ผู้ป่วยธาตุ${el}ที่ได้รับ “${svc}” ปวดลดลงเฉลี่ย ${s.mean.toFixed(1)} คะแนน มากกว่าค่าเฉลี่ยคลินิก ${diff.toFixed(1)} คะแนน`
          : `ผู้ป่วยธาตุ${el}ที่ได้รับ “${svc}” ปวดลดลงเพียง ${s.mean.toFixed(1)} คะแนน น้อยกว่าค่าเฉลี่ยคลินิก ${Math.abs(diff).toFixed(1)} คะแนน — ควรพิจารณาบริการอื่น`,
    });
  }
  return out.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 5);
}

/** the services that worked best for one element (for the AI planner and the patient page) */
export function bestForElement(rows: OutcomeRow[], element: Element, services: Service[], minN = 4) {
  const mine = rows.filter((r) => r.element === element);
  return services
    .map((s) => ({ service: s, ...summarize(mine.filter((r) => r.a.serviceId === s.id)) }))
    .filter((x) => x.n >= minN)
    .sort((a, b) => b.mean - a.mean);
}
