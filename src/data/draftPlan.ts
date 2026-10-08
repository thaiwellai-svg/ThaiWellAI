import type { AIPlan, AppGuide, Intake, Service } from "./types";

/**
 * คอร์สแนะนำเบื้องต้นจากผลประเมินก่อนนวด (กติกาตายตัว ไม่ใช้ AI) — เป็นแนวทางให้คลินิกปรับต่อ แล้วแพทย์อนุมัติจึงเปิดคอร์สจริง
 *   จำนวนครั้ง: ปวด ≥7 → 5 · ปวด 4–6 → 3 · ปวด ≤3 → ไม่ต้องเปิดคอร์ส
 *   +1 ถ้าเป็นมานาน (เป็นเดือน/ปี) · +1 ถ้าปวดหลายตำแหน่ง (≥3) · ไม่เกิน 8
 *   ความถี่: ปวด ≥7 → สัปดาห์ละ 2 ครั้ง · นอกนั้นสัปดาห์ละ 1 ครั้ง
 */
export function draftCourse(i: Intake, service: Service, guide?: AppGuide, referToDoctor = false): (AIPlan & { why: string[] }) | null {
  const pain = i.pain;
  let sessions = pain >= 7 ? 5 : pain >= 4 ? 3 : 0;
  if (!sessions) return null;
  const chronic = /เดือน|ปี/.test(i.duration ?? "");
  const many = (i.focusAreas ?? []).length >= 3;
  if (chronic) sessions++;
  if (many) sessions++;
  sessions = Math.min(8, sessions);
  const perWeek = pain >= 7 ? 2 : 1;
  const frequency = `สัปดาห์ละ ${perWeek} ครั้ง`;
  const weeks = Math.ceil(sessions / perWeek);
  const areas = (i.focusAreas ?? []).join(" ");
  const why = [`ปวด ${pain}/10`, ...(areas ? [areas] : []), ...(chronic ? [`เป็นมา ${i.duration}`] : []), ...(many ? ["ปวดหลายตำแหน่ง"] : [])];
  return {
    at: new Date().toISOString(),
    model: "rule:intake",
    summary: `${guide?.condition || i.complaint} · ${service.name} ${sessions} ครั้ง ${frequency} (ร่างจากผลประเมิน)`,
    massageType: /สุขภาพ/.test(service.name) ? "นวดเพื่อสุขภาพ" : "นวดเพื่อการรักษา",
    elementNote: "",
    goals: [`ลดปวดจาก ${pain}/10 ให้เหลือไม่เกิน ${Math.max(0, pain - 4)}/10`],
    sessions,
    frequency,
    phases: [{ title: "ลดปวด", weeks: `1–${weeks}`, serviceId: service.id, focus: areas || i.complaint, technique: guide?.methods?.[0] ?? service.name }],
    herbs: [],
    homeCare: [],
    precautions: [...(guide?.caution ? [guide.caution] : []), ...((i.avoidAreas ?? []).length ? [`ห้ามนวด ${i.avoidAreas.join(" ")}`] : [])],
    referToDoctor,
    approved: false,
    why,
  };
}
