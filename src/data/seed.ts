import type {
  Appointment,
  AppointmentStatus,
  BookingRequest,
  ClinicSettings,
  Notification,
  Patient,
  RequestDecision,
  Screening,
  Service,
  Therapist,
} from "./types";
import { addISODays, fromISODate, fromMinutes, todayISO } from "./thaiDate";
import { onDuty, servicesAt } from "./domain";
import { birthElement, birthMonthOf } from "./elements";

/* Deterministic PRNG so the demo data is identical on every load. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SERVICES: Service[] = [
  { id: "s1", name: "นวดไทยเพื่อสุขภาพ", short: "นวดสุขภาพ", minutes: 60, price: 350 },
  { id: "s2", name: "นวดไทยเพื่อการรักษา", short: "นวดรักษา", minutes: 60, price: 450 },
  { id: "s3", name: "ประคบสมุนไพร", short: "ประคบ", minutes: 60, price: 300 },
  { id: "s4", name: "นวดเท้าเพื่อสุขภาพ", short: "นวดเท้า", minutes: 60, price: 300 },
  { id: "s5", name: "นวดไทยร่วมประคบสมุนไพร", short: "นวด+ประคบ", minutes: 90, price: 600 },
];

const sh = (days: number[], start: string, end: string, services: string[]) => ({ days, start, end, services });
const WEEKDAYS = [1, 2, 3, 4, 5];
const MON_SAT = [1, 2, 3, 4, 5, 6];
/** union of services across a therapist's blocks */
const offered = (shifts: { services: string[] }[]) => [...new Set(shifts.flatMap((x) => x.services))].sort();
const therapist = (t: Omit<Therapist, "services">): Therapist => ({ ...t, services: offered(t.shifts) });

// Each therapist registers their own work slots: several blocks a day, gaps allowed, services per block.
const BASE_THERAPISTS: Therapist[] = [
  therapist({ id: "t1", name: "นศ.พท. สมชาย", role: "นักศึกษาแพทย์แผนไทย", color: "#4c845a",
    shifts: [sh(MON_SAT, "08:00", "10:00", ["s1", "s4"]), sh(MON_SAT, "10:00", "12:00", ["s3"])] }),
  therapist({ id: "t2", name: "พท.ป. วิภาวดี ศรีสุข", role: "แพทย์แผนไทยประยุกต์", color: "#c1723e",
    shifts: [sh(MON_SAT, "08:00", "12:00", ["s2", "s5"]), sh(MON_SAT, "13:00", "16:00", ["s1", "s3", "s4"])] }),
  therapist({ id: "t3", name: "พท.ป. อรุณี แก้วมณี", role: "แพทย์แผนไทยประยุกต์", color: "#077dd7",
    shifts: [
      sh(WEEKDAYS, "08:00", "10:00", ["s2"]),
      // 10:00–11:00 free (meeting / paperwork)
      sh(WEEKDAYS, "11:00", "12:00", ["s3"]),
      sh(WEEKDAYS, "13:00", "16:00", ["s1", "s5"]),
    ] }),
  therapist({ id: "t4", name: "นศ.พท. ธนากร ทองดี", role: "นักศึกษาแพทย์แผนไทย", color: "#8b5cf6",
    shifts: [sh(MON_SAT, "13:00", "15:00", ["s1", "s4"]), sh(MON_SAT, "15:00", "16:00", ["s3"])] }),
  therapist({ id: "t5", name: "พท.ป. กมลชนก ใจงาม", role: "แพทย์แผนไทยประยุกต์", color: "#d97706",
    shifts: [
      sh([1, 2, 3, 5, 6], "08:00", "11:00", ["s1", "s2"]),
      sh([1, 2, 3, 5, 6], "13:00", "14:00", ["s3"]),
      sh([1, 2, 3, 5, 6], "14:00", "16:00", ["s5"]),
    ] }),
  therapist({ id: "t6", name: "พท.ป. ปิยะพงษ์ รุ่งเรือง", role: "แพทย์แผนไทยประยุกต์", color: "#0f766e",
    shifts: [
      sh([1, 2, 4, 5], "09:00", "12:00", ["s2", "s4"]),
      sh([1, 2, 4, 5], "13:00", "16:00", ["s1", "s5"]),
      sh([6], "08:00", "12:00", ["s1", "s2"]),
    ] }),
];

/** next open (Mon–Sat) date at least `n` days from today */
const workdayAhead = (n: number, weekdaysOnly = false) => {
  let d = addISODays(todayISO(), n);
  while (fromISODate(d).getDay() === 0 || (weekdaysOnly && fromISODate(d).getDay() === 6)) d = addISODays(d, 1);
  return d;
};

// demo one-off changes: a leave day and a shorter day
export const THERAPISTS: Therapist[] = BASE_THERAPISTS.map((t) =>
  t.id === "t3"
    ? { ...t, exceptions: { [workdayAhead(2, true)]: { kind: "leave" as const, reason: "ลาป่วย", blocks: [] } } }
    : t.id === "t1"
      ? { ...t, exceptions: { [workdayAhead(3)]: { kind: "custom" as const, note: "มีสอบช่วงบ่าย", blocks: [{ start: "08:00", end: "10:00", services: ["s1"] }] } } }
      : t,
);

export const DEFAULT_SETTINGS: ClinicSettings = {
  // ชื่อเดียวกับคลินิกที่เชื่อมในแอป ThaiWell AI (PLACES "skv")
  clinicName: "คลินิกแพทย์แผนไทย สาขาสุขุมวิท",
  promptpayId: "0812345678",
  autoSendSlip: true,
  rooms: [
    { id: "ra", name: "ห้องนวดไทย A", beds: [{ id: "A1", name: "เตียง A1" }, { id: "A2", name: "เตียง A2" }, { id: "A3", name: "เตียง A3" }] },
    { id: "rb", name: "ห้องนวดไทย B", beds: [{ id: "B1", name: "เตียง B1" }, { id: "B2", name: "เตียง B2" }] },
    { id: "rh", name: "ห้องประคบสมุนไพร", beds: [{ id: "H1", name: "เตียง H1" }, { id: "H2", name: "เตียง H2" }] },
  ],
  staffName: "คุณวราภรณ์ ใจเย็น",
  staffRole: "เจ้าหน้าที่ประจำคลินิก",
  openTime: "08:00",
  closeTime: "16:00",
  slotMinutes: 60,
  bedsPerSlot: 6,
  closedWeekdays: [0],
  bpThreshold: 160,
  surgeryRecoveryDays: 30,
  minDaysBetweenSessions: 2,
  requireApproval: true,
  notifyNewRequest: true,
  notifyNoShow: true,
  followUpReminder: true,
  followUpHours: 48,
  noShowMinutes: 15,
  notifyConfirm: true,
  notifyReminder: true,
  reminderHours: 24,
  shareHistory: true,
  shareTopics: ["visits", "pain", "advice", "credits"],
  shareTiming: "after",
  backdrop: "reception",
};

/** ผู้รับบริการจำลองที่มาเอง/โทรจอง (ไม่เยอะ) — ผู้ใช้หลักของเดโมมาจากแอป ThaiWell AI (DEMO_* ด้านล่าง) */
const NAMES: [string, "ชาย" | "หญิง"][] = [
  ["นาย สุรชัย ใจดี", "ชาย"],
  ["นางสาว พิมพ์ชนก วงศ์ใหญ่", "หญิง"],
  ["นาง สมพร แสงทอง", "หญิง"],
  ["นาย ธีรวัฒน์ บุญมา", "ชาย"],
  ["นางสาว กัญญารัตน์ ศรีวงศ์", "หญิง"],
  ["นาย วิชัย พรหมมา", "ชาย"],
  ["นาง บุญเรือน สุขสวัสดิ์", "หญิง"],
  ["นาย อนุชา แก้วประเสริฐ", "ชาย"],
  ["นางสาว ณัฐธิดา จันทร์เพ็ญ", "หญิง"],
  ["นาย ประเสริฐ ทองคำ", "ชาย"],
  ["นาง ทองใบ ประจำถิ่น", "หญิง"],
];

const COMPLAINTS = [
  "ปวดคอ บ่า ไหล่ขวา จากการทำงานหน้าคอมพิวเตอร์",
  "ปวดหลังส่วนล่าง ร้าวลงสะโพก",
  "ปวดเข่าทั้งสองข้าง ขึ้นลงบันไดลำบาก",
  "ตึงต้นคอ ปวดศีรษะเรื้อรัง",
  "ปวดสะบัก ชาปลายมือขวา",
  "นอนไม่หลับ มีความเครียดสะสม",
  "ต้องการนวดผ่อนคลายกล้ามเนื้อ",
  "ปวดน่อง ตะคริวบ่อยตอนกลางคืน",
];
const CONDITIONS = ["ความดันโลหิตสูง", "เบาหวาน", "ออฟฟิศซินโดรม", "ข้อเข่าเสื่อม", "ไมเกรน", "ไขมันในเลือดสูง", "กรดไหลย้อน"];

export interface SeedData {
  patients: Patient[];
  appointments: Appointment[];
  requests: BookingRequest[];
  notifications: Notification[];
  decisions: RequestDecision[];
}

export function createSeed(): SeedData {
  const rnd = mulberry32(20260930);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  const today = todayISO();

  /* ── Patients ─────────────────────────────────────────── */
  const patients: Patient[] = NAMES.map(([name, gender], i) => {
    const hasCourse = i === 0 || rnd() < 0.7;
    const serviceId = i === 0 ? "s1" : pick(["s1", "s2", "s2", "s3", "s5"]);
    const total = serviceId === "s3" ? 10 : 6;
    const used = i === 5 ? total : i === 0 ? 2 : int(0, total - 1);
    const started = addISODays(today, -int(4, 26));
    const n = int(3, 6);
    const base = int(5, 8);
    const painHistory = Array.from({ length: n }, (_, k) => ({
      date: addISODays(today, -(n - k) * int(3, 5)),
      score: Math.max(1, Math.min(10, base - Math.round(k * (0.6 + rnd() * 0.5)) + (rnd() < 0.2 ? 1 : 0))),
    }));
    painHistory.sort((a, b) => a.date.localeCompare(b.date));
    return {
      id: `p${i + 1}`,
      hn: `HN${String(640_120 + i * 37).padStart(7, "0")}`,
      name,
      gender,
      age: int(24, 72),
      phone: `08${int(1, 9)}-${int(100, 999)}-${int(1000, 9999)}`,
      conditions: rnd() < 0.55 ? [pick(CONDITIONS)].concat(rnd() < 0.25 ? [pick(CONDITIONS)] : []).filter((v, k, a) => a.indexOf(v) === k) : [],
      complaint: i === 0 ? COMPLAINTS[0] : pick(COMPLAINTS),
      course: hasCourse
        ? {
            name: `${SERVICES.find((s) => s.id === serviceId)!.name} ${total} ครั้ง`,
            serviceId,
            total,
            used,
            startedOn: started,
            expiresOn: addISODays(started, 30),
          }
        : undefined,
      painHistory,
      registeredOn: addISODays(today, -int(20, 400)),
    };
  });

  /* ── Appointments ─────────────────────────────────────── */
  const appointments: Appointment[] = [];
  let seq = 1;
  const SLOTS = ["08:00", "09:00", "10:00", "11:00", "13:00", "14:00", "15:00"];
  const push = (a: Omit<Appointment, "id">) => appointments.push({ id: `a${seq++}`, ...a });

  // Upcoming sessions must stay inside each patient's course credits (used + booked ≤ total).
  const booked = new Map<string, number>();
  const payPerVisit = patients.filter((p) => !p.course).map((p) => p.id);
  const bookable = (pid: string) => {
    const p = patients[Number(pid.slice(1)) - 1];
    if (!p.course) return true;
    // leave most patients with a couple of credits so the planner has room to work
    const headroom = Number(pid.slice(1)) % 4 === 0 ? 0 : 2;
    return p.course.used + (booked.get(pid) ?? 0) < p.course.total - headroom;
  };
  const claim = (pid: string, upcoming: boolean) => {
    if (!upcoming) return pid;
    const id = bookable(pid) ? pid : pick(payPerVisit);
    booked.set(id, (booked.get(id) ?? 0) + 1);
    return id;
  };

  for (let offset = -21; offset <= 21; offset++) {
    const date = addISODays(today, offset);
    const dow = fromISODate(date).getDay();
    if (offset !== 0 && dow === 0) continue;

    if (offset === 0) {
      // Today — fill every slot but one of the therapists on duty, so a walk-in can still be seated.
      const plan: { start: string; type: "booked" | "walkin" }[] = [];
      for (const t of SLOTS) {
        const n = Math.min(2, Math.max(0, THERAPISTS.filter((th) => onDuty(th, date, t)).length - 1));
        for (let j = 0; j < n; j++) plan.push({ start: t, type: (plan.length + 1) % 6 === 0 ? "walkin" : "booked" });
      }
      plan.sort((a, b) => a.start.localeCompare(b.start));
      const bedUse = new Map<string, number>();
      plan.forEach((p, k) => {
        const slotIdx = SLOTS.indexOf(p.start);
        const bed = bedUse.get(p.start) ?? 0;
        bedUse.set(p.start, bed + 1);
        let status: AppointmentStatus = "waiting";
        if (slotIdx <= 1) status = rnd() < 0.18 ? "absent" : "done";
        else if (slotIdx === 2) status = bed < 3 ? "active" : "waiting";
        const painBefore = int(4, 8);
        push({
          patientId: claim(k === 0 ? "p1" : `p${int(2, patients.length)}`, status === "waiting" || status === "active"),
          serviceId: k === 0 ? "s1" : pick(["s1", "s1", "s2", "s2", "s3", "s4", "s5"]),
          therapistId: k === 0 ? "t1" : THERAPISTS[bed % THERAPISTS.length].id,
          date,
          start: k === 0 ? "09:00" : p.start,
          status,
          type: p.type,
          painBefore: k === 0 ? 7 : painBefore,
          painAfter: status === "done" ? Math.max(1, painBefore - int(2, 4)) : undefined,
          paid: status === "done" ? rnd() < 0.72 : false,
        });
      });
      continue;
    }

    const count = offset < 0 ? int(6, 10) : Math.max(2, int(7, 11) - Math.floor(offset / 2));
    for (let k = 0; k < count; k++) {
      const start = pick(SLOTS);
      const painBefore = int(3, 8);
      let status: AppointmentStatus = "waiting";
      if (offset < 0) {
        const r = rnd();
        status = r < 0.88 ? "done" : r < 0.96 ? "absent" : "cancelled";
      }
      push({
        patientId: claim(`p${int(offset > 0 ? 2 : 1, patients.length)}`, offset > 0),
        serviceId: pick(["s1", "s2", "s2", "s3", "s4", "s5"]),
        therapistId: pick(THERAPISTS).id,
        date,
        start,
        status,
        type: rnd() < 0.72 ? "booked" : "walkin",
        painBefore,
        painAfter: status === "done" ? Math.max(1, painBefore - int(1, 4)) : undefined,
        paid: status === "done",
      });
    }
  }

  /* ── Match every session to a therapist who is on shift, offers the service and is free ── */
  const taken = new Map<string, Set<string>>();
  const kept = appointments.filter((a) => {
    if (a.status === "cancelled") return true;
    const key = `${a.date}|${a.start}`;
    const used = taken.get(key) ?? new Set<string>();
    taken.set(key, used);
    // queues were booked before anyone took leave, so match against the regular weekly schedule
    const duty = BASE_THERAPISTS.filter((t) => !used.has(t.id) && onDuty(t, a.date, a.start));
    const offers = (x: Therapist) => servicesAt(x, a.date, a.start).includes(a.serviceId);
    let t = duty.find((x) => x.id === a.therapistId && offers(x)) ?? duty.find(offers);
    if (!t && duty[0]) {
      t = duty[0];
      a.serviceId = servicesAt(t, a.date, a.start)[0];
    }
    if (!t) return false;
    a.therapistId = t.id;
    used.add(t.id);
    return true;
  });
  appointments.splice(0, appointments.length, ...kept);

  /* ── Booking requests: มาจากแอป ThaiWell AI ผ่าน cloud เท่านั้น (src/sync/demo.ts) ── */
  const clean: Screening = { fever: false, highBP: false, menstruation: false, pregnant: false, recentSurgery: false, contagious: false };
  const requests: BookingRequest[] = [];

  const thaiDateWeekday = (d: string) => "วัน" + ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"][fromISODate(d).getDay()];
  const noShow = appointments.find((a) => a.date === today && a.start === "08:00" && a.status !== "done") ?? appointments.find((a) => a.date === today && a.start === "08:00")!;
  const noShowName = patients.find((p) => p.id === noShow.patientId)!.name;
  const notifications: Notification[] = [
    { id: "n3", kind: "noshow", title: "ผู้ป่วยไม่มาตามนัด", body: `${noShowName} · รอบ 08:00 น. เลยเวลา 15 นาที`, at: new Date(Date.now() - 95 * 60_000).toISOString(), read: false, link: "/appointments", ref: noShow.id },
    { id: "n4", kind: "staff", title: "เจ้าหน้าที่แจ้งลา", body: `พท.ป. อรุณี แก้วมณี ลาป่วย${thaiDateWeekday(workdayAhead(2, true))} · มีคิวที่ต้องย้ายผู้บำบัด`, at: new Date(Date.now() - 180 * 60_000).toISOString(), read: false, link: "/planner", ref: "t3" },
    { id: "n5", kind: "info", title: "ครบกำหนดติดตามผล 48 ชม.", ref: "followup", body: "ผู้รับบริการ 3 รายรอส่งแบบประเมิน Pain Score หลังนวด", at: new Date(Date.now() - 240 * 60_000).toISOString(), read: true, link: "/patients" },
    { id: "n7", kind: "info", title: "เครดิตใกล้หมด", ref: "credits", body: "ผู้รับบริการ 2 รายเหลือเครดิต 1 ครั้ง · แนะนำนัดพบแพทย์ต่อแผน", at: new Date(Date.now() - 1800 * 60_000).toISOString(), read: true, link: "/patients" },
  ];


  /* ── Past decisions (history tab) ─────────────────────── */
  const REJECT_REASONS = ["คิวเต็มช่วงเวลาที่ขอ", "ผลคัดกรองไม่ผ่าน ต้องพบแพทย์ก่อน", "เครดิตคงเหลือไม่พอ", "ผู้ป่วยขอยกเลิก"];
  const decisions: RequestDecision[] = Array.from({ length: 6 }, (_, k) => {
    const pid = `p${int(1, patients.length)}`;
    const hoursAgo = 3 + k * int(5, 11);
    const decidedAt = new Date(Date.now() - hoursAgo * 3600_000);
    const date = addISODays(today, int(-3, 6));
    const start = pick(SLOTS);
    const rejected = k % 4 === 2 || k === 7;
    const reason = rejected ? REJECT_REASONS[k % REJECT_REASONS.length] : undefined;
    return {
      id: `d${k + 1}`,
      request: {
        id: `rh${k + 1}`,
        patientId: pid,
        serviceId: pick(["s1", "s2", "s3", "s5"]),
        therapistId: pick(THERAPISTS).id,
        date,
        start,
        painScore: int(3, 9),
        screening: { ...clean, ...(reason === "ผลคัดกรองไม่ผ่าน ต้องพบแพทย์ก่อน" ? { fever: true } : {}) },
        submittedAt: new Date(decidedAt.getTime() - int(20, 240) * 60_000).toISOString(),
      },
      outcome: rejected ? "rejected" : "approved",
      slot: rejected ? undefined : { date, start: k % 5 === 0 ? pick(SLOTS) : start, therapistId: pick(THERAPISTS).id },
      reason,
      note: rejected && k === 2 ? "แนะนำให้จองรอบบ่ายวันถัดไป" : undefined,
      decidedAt: decidedAt.toISOString(),
      decidedBy: k % 3 === 0 ? "คุณวราภรณ์ ใจเย็น" : DEFAULT_SETTINGS.staffName,
    };
  });

  /* ── Payment history: every settled visit gets a receipt ─ */
  {
    const settled = appointments.filter((a) => a.status === "done").sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    const seq = new Map<string, number>();
    for (const a of settled) {
      const p = patients.find((x) => x.id === a.patientId)!;
      const price = SERVICES.find((x) => x.id === a.serviceId)?.price ?? 300;
      const at = new Date(`${a.date}T${a.start}:00`);
      at.setMinutes(at.getMinutes() + 65);
      const be = at.getFullYear() + 543;
      const n = (seq.get(String(be)) ?? 200) + 1;
      seq.set(String(be), n);
      const no = `RC${be}-${String(n).padStart(6, "0")}`;
      a.startedAt = new Date(`${a.date}T${a.start}:00`).toISOString();
      a.endedAt = new Date(at.getTime() - 5 * 60_000).toISOString();
      if (p.course) {
        a.paid = true;
        a.payment = { no, method: "credit", amount: 0, status: "paid", at: at.toISOString() };
      } else if (a.date < today && rnd() < 0.18) {
        // some patients chose to pay later in the ThaiWell AI app
        a.paid = false;
        a.payment = { no, method: "app", amount: price, status: "pending", at: at.toISOString() };
      } else if (a.paid) {
        const method = rnd() < 0.55 ? "promptpay" : "cash";
        const received = method === "cash" ? (price <= 500 ? pick([price, 500, 1000]) : 1000) : undefined;
        a.payment = { no, method, amount: price, received, status: "paid", at: at.toISOString() };
      } else if (a.date < today) {
        // older unpaid visits were billed to the patient's app
        a.payment = { no, method: "app", amount: price, status: "pending", at: at.toISOString() };
      }
    }
  }

  // today shows every step of the counter flow: treating · assessing · billing · called · waiting · done · absent
  {
    const iso = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
    const todays = appointments.filter((a) => a.date === today).sort((x, y) => x.start.localeCompare(y.start));
    const active = todays.filter((a) => a.status === "active");
    // need three in-progress visits (treating · assessing · billing)
    for (const w of todays.filter((a) => a.status === "waiting")) {
      if (active.length >= 3) break;
      w.status = "active";
      active.push(w);
    }
    const beds = ["A1", "A2", "B1", "B2", "A3", "H1"];
    active.forEach((a, i) => {
      a.bedId = beds[i % beds.length];
      a.startedAt = iso(i === 0 ? 22 : 70);
      a.calledAt = iso(i === 0 ? 26 : 75);
      a.log = [
        { at: a.calledAt, label: "เรียกคิว" },
        { at: a.startedAt, label: `เริ่มรับบริการ · เตียง ${a.bedId}` },
      ];
      if (i === 0) return; // กำลังรับบริการ
      a.endedAt = iso(6);
      a.log.push({ at: a.endedAt, label: "จบการรักษา" });
      if (i === 1) return; // รอบันทึกการรักษา
      a.painAfter = Math.max(1, a.painBefore - 3); // รอชำระเงิน
      a.log.push({ at: iso(4), label: `บันทึกการรักษา · Pain ${a.painBefore} → ${a.painAfter}` });
    });
    // the next patient has been called to the counter
    const next = todays.find((a) => a.status === "waiting");
    if (next) {
      next.calledAt = iso(2);
      next.log = [{ at: next.calledAt, label: "เรียกคิว" }];
    }
    // one finished visit still owes money
    const unpaid = todays.find((a) => a.status === "done" && !patients.find((p) => p.id === a.patientId)?.course);
    if (unpaid) {
      unpaid.paid = false;
      delete unpaid.payment;
    }
  }

  // finished visits carry a diagnosis and procedures, like a real record
  {
    const DX: Record<string, string> = {
      s1: "ลมปลายปัตคาด (ปวดกล้ามเนื้อคอ บ่า ไหล่)",
      s2: "ลมปลายปัตคาดสัญญาณ 4 หลัง (ปวดหลังส่วนล่าง)",
      s3: "ลมปลายปัตคาด (ปวดกล้ามเนื้อคอ บ่า ไหล่)",
      s4: "ลมจับโปงแห้งเข่า (ข้อเข่าเสื่อม)",
      s5: "ไหล่ติด",
    };
    const PR: Record<string, string[]> = {
      s1: ["นวดไทยเพื่อสุขภาพ"],
      s2: ["นวดไทยเพื่อการรักษา", "กดจุดเส้นประธานสิบ"],
      s3: ["ประคบสมุนไพร"],
      s4: ["นวดเท้าเพื่อสุขภาพ"],
      s5: ["นวดไทยเพื่อการรักษา", "ประคบสมุนไพร"],
    };
    const svcMin = (id: string) => SERVICES.find((x) => x.id === id)?.minutes ?? 60;
    for (const a of appointments) {
      if (a.status !== "done" && !(a.status === "active" && a.painAfter !== undefined)) continue;
      a.diagnoses = [{ name: DX[a.serviceId] ?? DX.s1, kind: "principal" }];
      a.procedures = (PR[a.serviceId] ?? PR.s1).map((name, i) => ({ name, minutes: i === 0 ? svcMin(a.serviceId) : undefined, area: i === 0 ? "เส้นอิทา ปิงคลา บ่าและหลัง" : undefined }));
    }
  }

  // past outcomes follow Thai-medicine expectations (heat suits ดิน/น้ำ, not ไฟ; treatment massage suits ลม),
  // so the outcomes dashboard has real patterns to surface
  {
    const RELIEF: Record<string, number> = { s1: 2.0, s2: 3.0, s3: 2.2, s4: 1.5, s5: 3.2 };
    const byId = new Map(patients.map((p) => [p.id, p]));
    // pain on arrival eases over a course of visits
    const past = appointments.filter((a) => a.status === "done" && a.date < today).sort((x, y) => (x.date + x.start).localeCompare(y.date + y.start));
    const seen = new Map<string, number>();
    const base = new Map<string, number>();
    for (const a of past) {
      const i = seen.get(a.patientId) ?? 0;
      seen.set(a.patientId, i + 1);
      if (!base.has(a.patientId)) base.set(a.patientId, 6 + Math.floor(rnd() * 3));
      a.painBefore = Math.max(2, Math.min(9, Math.round(base.get(a.patientId)! - 0.45 * i + (rnd() - 0.5) * 1.6)));
    }
    for (const a of appointments) {
      if (a.status !== "done" || a.date >= today) continue;
      const p = byId.get(a.patientId);
      if (!p) continue;
      const el = birthElement(birthMonthOf(p));
      const heat = a.serviceId === "s3" || a.serviceId === "s5";
      let r = RELIEF[a.serviceId] ?? 2;
      if (heat && el === "ไฟ") r -= 1.4;
      if (heat && (el === "ดิน" || el === "น้ำ")) r += 0.7;
      if (a.serviceId === "s2" && el === "ลม") r += 0.9;
      r += (rnd() - 0.5) * 1.8;
      a.painAfter = Math.max(0, Math.min(a.painBefore, Math.round(a.painBefore - r)));
    }
  }

  addAppUser(patients, appointments, today);

  return { patients, appointments, requests, notifications, decisions };
}

/* ── ผู้ใช้แอป ThaiWell AI ตัวอย่าง: คุณสมศักดิ์ รักดี ──────────────────────────────────────────
 * ข้อมูลชุดเดียวกับแอป (homeFeed.ts TREATMENT_CASES · SAMPLE_BILLS) — ประวัติ คะแนนปวด ผู้บำบัด บิล ตรงกันทุกครั้ง
 * นัดที่ยังไม่จบมี cloudId → อยู่ใน Supabase ด้วย (src/sync/demo.ts) ทั้งสองระบบจึงเห็นและแก้สถานะเดียวกัน */
export const DEMO_PATIENT = { id: "p-somsak", cloudId: "app-p-zk6srq", name: "คุณสมศักดิ์ รักดี" };
export const DEMO_REFS = { officeToday: "tw-demo-office-6", lungBill: "tw-demo-lung-3", lungNext: "tw-demo-lung-4" };

function addAppUser(patients: Patient[], appointments: Appointment[], today: string) {
  const visit = (date: string, serviceId: string, therapistId: string, start: string, painBefore: number, painAfter: number, dx: string, proc: string[], extra: Partial<Appointment> = {}): Appointment => {
    const min = SERVICES.find((x) => x.id === serviceId)?.minutes ?? 60;
    const at = new Date(`${date}T${start}:00`);
    return {
      id: `a-somsak-${date}`,
      patientId: DEMO_PATIENT.id,
      serviceId,
      therapistId,
      date,
      start,
      status: "done",
      type: "booked",
      painBefore,
      painAfter,
      paid: true,
      startedAt: at.toISOString(),
      endedAt: new Date(at.getTime() + min * 60_000).toISOString(),
      diagnoses: [{ name: dx, kind: "principal" }],
      procedures: proc.map((name, i) => ({ name, minutes: i === 0 ? min : undefined, area: i === 0 ? "คอ บ่า ไหล่" : undefined })),
      payment: { no: `RC2569-${date.replace(/-/g, "").slice(2)}`, method: "credit", amount: 0, status: "paid", at: new Date(at.getTime() + (min + 10) * 60_000).toISOString() },
      ...extra,
    };
  };
  const OFFICE = "ลมปลายปัตคาดสัญญาณ 4 (คอ บ่า ไหล่)";
  const LUNG = "ภูมิแพ้ทางเดินหายใจ";
  const LBP = "ลมปลายปัตคาดสัญญาณ 4 หลัง (ปวดหลังส่วนล่าง)";
  const history: Appointment[] = [
    // ปวดหลัง (จบคอร์สแล้ว — แท็บประวัติในแอป)
    ...([["2026-03-03", 7, 5], ["2026-03-17", 6, 4], ["2026-03-31", 5, 3], ["2026-04-14", 4, 2], ["2026-04-28", 3, 1], ["2026-05-12", 2, 1]] as const).map(([d, b, a]) =>
      visit(d, "s5", "t2", "09:00", b, a, LBP, ["นวดไทยเพื่อการรักษา", "ประคบสมุนไพร"]),
    ),
    // ออฟฟิศซินโดรม (คอร์ส 8 ครั้ง ใช้ไป 5)
    ...([["2026-06-14", 8, 6], ["2026-06-28", 8, 5], ["2026-07-12", 7, 5], ["2026-08-02", 7, 4], ["2026-08-30", 6, 3]] as const).map(([d, b, a]) =>
      visit(d, "s2", "t2", "10:00", b, a, OFFICE, ["นวดไทยแบบราชสำนัก", "กดจุดสัญญาณ 4 หลัง"]),
    ),
    // ภูมิแพ้ (จ่ายรายครั้ง 400 บาท: นวดหน้า ศีรษะ ไหล่ + ลูกประคบ)
    ...([["2026-07-19", 6, 5], ["2026-08-02", 6, 4], ["2026-08-16", 5, 3]] as const).map(([d, b, a]) =>
      visit(d, "s1", "t3", "14:00", b, a, LUNG, ["นวดหน้า ศีรษะ ไหล่", "ลูกประคบสมุนไพร"], {
        id: `a-somsak-lung-${d}`,
        payment: { no: `RC2569-${d.replace(/-/g, "").slice(2)}L`, method: "promptpay", amount: 400, status: "paid", at: new Date(`${d}T15:10:00`).toISOString() },
      }),
    ),
  ];
  // ครั้งที่ 5 ของออฟฟิศซินโดรม: จ่าย 450 บาท ใบเสร็จ RC2569-000123 (ตรงกับใบเสร็จในแอป)
  const o5 = history.find((a) => a.date === "2026-08-30")!;
  o5.payment = { no: "RC2569-000123", method: "promptpay", amount: 450, status: "paid", at: new Date("2026-08-30T12:20:00").toISOString() };
  // ภูมิแพ้ครั้งที่ 3: บิล 400 บาท ส่งเข้าแอป ยังไม่จ่าย
  const l3 = history.find((a) => a.date === "2026-08-16" && a.serviceId === "s1")!;
  l3.paid = false;
  l3.cloudId = DEMO_REFS.lungBill;
  l3.payment = { no: "RC2569-000118", method: "app", amount: 400, status: "pending", at: new Date("2026-08-16T15:10:00").toISOString() };

  // วันนี้: ออฟฟิศซินโดรมครั้งที่ 6 — รอบถัดไปที่ยังทัน · ผู้บำบัดที่เข้าเวรและรับนวดรักษารอบนั้น
  const hour = Math.min(15, Math.max(8, new Date().getHours() + 1));
  const start = `${String(hour === 12 ? 13 : hour).padStart(2, "0")}:00`;
  const duty = BASE_THERAPISTS.filter((t) => onDuty(t, today, start));
  const t = duty.find((x) => servicesAt(x, today, start).includes("s2")) ?? duty.find((x) => servicesAt(x, today, start).includes("s1")) ?? BASE_THERAPISTS[1];
  const svc = servicesAt(t, today, start).includes("s2") ? "s2" : "s1";
  // คิวเดิมของผู้บำบัดคนนี้รอบนั้น → ย้ายไปคนอื่น/ลบ (ไม่ให้ชน)
  for (let i = appointments.length - 1; i >= 0; i--) if (appointments[i].date === today && appointments[i].start === start && appointments[i].therapistId === t.id) appointments.splice(i, 1);
  const office6: Appointment = { id: "a-somsak-today", patientId: DEMO_PATIENT.id, serviceId: svc, therapistId: t.id, date: today, start, status: "waiting", type: "booked", painBefore: 6, paid: false, cloudId: DEMO_REFS.officeToday, note: "จองผ่านแอป ThaiWell AI · ออฟฟิศซินโดรม ครั้งที่ 6/8" };
  // ภูมิแพ้ครั้งที่ 4: นัดล่วงหน้า (ไม่ตรงวันที่ผู้บำบัดลา)
  let next = workdayAhead(4, true);
  if (THERAPISTS.find((x) => x.id === "t3")?.exceptions?.[next]) next = workdayAhead(5, true);
  const lung4: Appointment = { id: "a-somsak-lung-next", patientId: DEMO_PATIENT.id, serviceId: "s1", therapistId: "t3", date: next, start: "14:00", status: "waiting", type: "booked", painBefore: 4, paid: false, cloudId: DEMO_REFS.lungNext, note: "จองผ่านแอป ThaiWell AI · รักษาภูมิแพ้ ครั้งที่ 4" };
  for (let i = appointments.length - 1; i >= 0; i--) if (appointments[i].date === next && appointments[i].start === "14:00" && appointments[i].therapistId === "t3") appointments.splice(i, 1);
  appointments.push(...history, office6, lung4);

  const done = history.filter((a) => a.painAfter !== undefined);
  patients.unshift({
    id: DEMO_PATIENT.id,
    hn: "TW-000123",
    name: DEMO_PATIENT.name,
    gender: "ชาย",
    age: 34,
    phone: "081-234-0123",
    conditions: ["ความดันโลหิตสูง"],
    allergies: [],
    complaint: "ปวดคอ บ่า ไหล่ จากการทำงาน (ออฟฟิศซินโดรม) · ภูมิแพ้ทางเดินหายใจ",
    course: { name: "นวดไทยเพื่อการรักษา 8 ครั้ง", serviceId: "s2", total: 8, used: 5, startedOn: "2026-06-14", expiresOn: addISODays(today, 60) },
    painHistory: done.map((a) => ({ date: a.date, score: a.painBefore })),
    registeredOn: "2026-03-03",
    birthMonth: 2,
    cloudId: DEMO_PATIENT.cloudId,
    member: true,
  });
}

export const slotTimes = (open: string, close: string, step: number) => {
  const [oh, om] = open.split(":").map(Number);
  const [ch, cm] = close.split(":").map(Number);
  const out: string[] = [];
  for (let m = oh * 60 + om; m < ch * 60 + cm; m += step) if (m !== 12 * 60) out.push(fromMinutes(m));
  return out;
};
