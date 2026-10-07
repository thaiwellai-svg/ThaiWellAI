import { useEffect, useRef, useState } from "react";
import { useStore } from "../store/store";
import { useToast } from "../design-system";
import { queueNumber } from "../features/AppointmentDrawer";
import { todayISO } from "../data/thaiDate";
import type { Appointment, BookingRequest, Intake, Patient } from "../data/types";
import { AVAILABILITY_KEY } from "../features/appBridge";
import { DEMO } from "../data/mode";
import { defaultAppAvatar } from "../data/avatars";
import { validCheckinCode } from "../features/checkinCode";
import { ensureDemoCloud, publishCloudAvailability, resetDemoCloud, takeDemoReseed } from "./demo";
import { cloud, logEvent, rank, updateAppt, type CloudAppt, type CloudEvent, type CloudStatus } from "./cloud";
import { pushNotify } from "./notify";

type Store = ReturnType<typeof useStore>;

/** what the clinic has done with a linked booking, as the shared status + the data the app needs */
function derive(store: Store, a: Appointment): { status: CloudStatus; patch: Partial<CloudAppt>; kind: string; summary: string } {
  const s = store.serviceById(a.serviceId);
  const t = store.therapistById(a.therapistId);
  const pay = a.payment;
  if (a.status === "cancelled") return { status: "cancelled", patch: { note: a.cancel?.reason }, kind: "booking.cancelled", summary: `คลินิกยกเลิกนัด · ${a.cancel?.reason ?? ""}` };
  if (a.status === "absent") return { status: "no_show", patch: {}, kind: "booking.no_show", summary: "บันทึกว่าไม่มาตามนัด" };
  if (pay?.status === "paid")
    return {
      status: "paid",
      patch: { bill: { amount: pay.amount, items: [s.name], status: "paid", method: pay.method, receipt_no: pay.no, paid_at: pay.at, via: pay.method === "app" ? "app" : "clinic" } },
      kind: "bill.paid",
      summary: `ชำระที่คลินิก ${pay.amount} บาท · ส่งใบเสร็จ ${pay.no ?? ""} เข้าแอป`,
    };
  if (pay?.status === "pending") return { status: "billed", patch: { bill: { amount: pay.amount, items: [s.name], status: "pending", via: "app", receipt_no: pay.no } }, kind: "bill.sent", summary: `ส่งบิล ${pay.amount} บาท ไปเรียกเก็บในแอป` };
  if (a.painAfter !== undefined && a.endedAt)
    return {
      status: "recorded",
      patch: {
        record: {
          findings: a.findings,
          diagnoses: a.diagnoses?.map((d) => d.name),
          procedures: a.procedures?.map((x) => [x.name, x.area, x.minutes ? `${x.minutes} นาที` : ""].filter(Boolean).join(" · ")),
          painBefore: a.painBefore,
          painAfter: a.painAfter,
          advice: a.advice,
          therapist: t.name,
        },
      },
      kind: "record.sent",
      summary: `ส่งผลการรักษา · ปวด ${a.painBefore} → ${a.painAfter}${a.advice ? " · พร้อมคำแนะนำ" : ""}`,
    };
  if (a.startedAt) return { status: "in_service", patch: {}, kind: "service.started", summary: `เริ่มรับบริการ · ${t.name}` };
  if (!a.calledAt && a.checkinQueue) return { status: "checked_in", patch: { queue_no: a.checkinQueue }, kind: "queue.issued", summary: `เช็กอินที่คลินิก · คิว ${a.checkinQueue}` };
  if (a.calledAt) {
    const q = queueNumber(store.appointments, a);
    return { status: "called", patch: q ? { queue_no: q } : {}, kind: "queue.called", summary: q ? `เรียกคิว ${q} เข้ารับบริการ` : "เรียกเข้ารับบริการ" };
  }
  return { status: "confirmed", patch: { date: a.date, start: a.start, therapist: t.name, service: s.name }, kind: "booking.confirmed", summary: `ยืนยันนัด ${a.date} ${a.start} น. · ${t.name}` };
}

/**
 * Keeps this back-office and the patient app in step through the shared cloud:
 * in  — bookings from the app become requests; app check-ins get a queue number; payments made in the app close the bill
 * out — confirm / reject, call, start, record, bill and payment go back to the app (and to the Flow Monitor)
 */
export function CloudBridge() {
  const store = useStore();
  const toast = useToast();
  const ref = useRef(store);
  ref.current = store;
  // last status each side knows about, so neither side moves a booking backwards or echoes its own change
  const known = useRef(new Map<string, string>());
  const planSent = useRef(new Set<string>());
  /** วัน|เวลา|ผู้บำบัด ของนัดที่ยืนยันแล้ว ตามที่อยู่ใน cloud — เปลี่ยนในหลังบ้าน (เลื่อนนัด) → ส่งไปแอป · cloud เปลี่ยน → รับมา */
  const slotSig = useRef(new Map<string, string>());
  /** นัดจากแอปที่กำลังสร้างกลับในเครื่องนี้ (กันซ้ำระหว่าง realtime กับรอบตรวจซ้ำ) */
  const adopting = useRef(new Set<string>());
  /** เลขคิวเช็กอินล่าสุดของแต่ละวัน (กันออกเลขซ้ำเมื่อเช็กอินพร้อมกันหลายคน) */
  const lastQueue = useRef(new Map<string, number>());
  const issuing = useRef(new Set<string>());
  /** ยอด/เลขใบเสร็จของบิลที่ส่งไปแอปแล้ว (แก้บิลระหว่างรอชำระ → ส่งใหม่) */
  const billSig = useRef(new Map<string, string>());
  /** นัดที่คลินิกลงเองให้ผู้ป่วยที่ใช้แอป (กำลังสร้างแถวใน cloud) · คอร์สที่ส่งไปแอปล่าสุด */
  const creating = useRef(new Set<string>());
  const courseSig = useRef(new Map<string, string>());
  // nothing is pushed until the cloud's current state has been read
  const [ready, setReady] = useState(false);

  /** avatar ที่ผู้ใช้เปลี่ยนในแอป → รูปในคลินิก (รูปถ่ายจริงที่เจ้าหน้าที่ถ่ายไว้ไม่ถูกแทน) */
  const syncPhoto = (p: Patient, cp?: CloudAppt["tw_patients"]) => {
    // ยังไม่มีรูปเลย → รูปตั้งต้นตามเพศแบบในแอป
    const avatar = cp?.profile?.avatar ?? (!p.photo && cp ? defaultAppAvatar(cp.gender ?? undefined) : undefined);
    if (!p.id || !avatar || p.photo === avatar || (p.photo && !p.photo.startsWith("avatar:"))) return;
    ref.current.dispatch({ type: "updatePatient", id: p.id, patch: { photo: avatar } });
  };
  /** the local patient for an app account (registered on first booking) */
  const patientFor = (row: CloudAppt): Patient => {
    const st = ref.current;
    const cp = row.tw_patients;
    const digits = cp?.phone?.replace(/\D/g, "") ?? "";
    // ผู้ป่วยเดิมของคลินิก: บัญชีแอปเดียวกัน → เลขบัตรประชาชนตรงกัน → เบอร์โทรตรงกัน
    const found =
      st.patients.find((p) => p.cloudId === row.patient_id) ??
      (cp?.citizen_id ? st.patients.find((p) => p.citizenId?.replace(/\D/g, "") === cp.citizen_id) : undefined) ??
      (digits.length >= 9 ? st.patients.find((p) => p.phone.replace(/\D/g, "") === digits) : undefined);
    if (found) {
      syncPhoto(found, cp);
      if (!found.cloudId) st.dispatch({ type: "updatePatient", id: found.id, patch: { cloudId: row.patient_id, ...(cp?.citizen_id && !found.citizenId ? { citizenId: cp.citizen_id } : {}) } });
      // ผู้ป่วยเดิมของคลินิก → HN เดิมไปแสดงในแอป
      if (cp && cp.clinic_hn !== found.hn) void cloud.from("tw_patients").update({ clinic_hn: found.hn }).eq("id", row.patient_id);
      return found;
    }
    const p: Patient = {
      id: `pc${Date.now().toString(36)}`,
      // HN ถัดจากเลขที่มากที่สุด (ลบผู้ป่วยแล้วไม่ออกเลขซ้ำ)
      hn: `HN${String(Math.max(641_000 + st.patients.length, ...st.patients.map((x) => Number(x.hn.replace(/\D/g, "")) || 0)) + 1).padStart(7, "0")}`,
      name: cp?.name ?? "ผู้ใช้แอป",
      gender: cp?.gender === "ชาย" ? "ชาย" : "หญิง",
      age: cp?.age ?? 30,
      phone: cp?.phone ?? "",
      conditions: row.assessment?.conditions ?? [],
      complaint: row.assessment?.complaint ?? "",
      painHistory: [],
      registeredOn: todayISO(),
      cloudId: row.patient_id,
      // ยืนยันตัวตนด้วยบัตรประชาชนในแอปแล้ว
      ...(cp?.citizen_id ? { citizenId: cp.citizen_id } : {}),
      ...(cp?.birth_date ? { birthDate: cp.birth_date } : {}),
      ...(cp?.address ? { address: cp.address } : {}),
      ...(cp?.email ? { email: cp.email } : {}),
      // รูปโปรไฟล์ = avatar ที่ผู้ใช้เลือกในแอป · ไม่ได้เลือก = รูปตั้งต้นตามเพศ (ตรงกับในแอป)
      photo: cp?.profile?.avatar ?? defaultAppAvatar(cp?.gender ?? undefined),
    };
    st.dispatch({ type: "addPatient", patient: p });
    void cloud.from("tw_patients").update({ clinic_hn: p.hn }).eq("id", row.patient_id);
    return p;
  };

  /** บริการที่ผู้ป่วยเลือก: รหัสจากแอป → ชื่อตรงกัน → ชื่อที่ยาวที่สุดที่อยู่ในป้าย ("นวดไทยร่วมประคบสมุนไพร" ไม่ใช่ "ประคบสมุนไพร") */
  const serviceFor = (name?: string | null, id?: string) => {
    const st = ref.current;
    if (id && st.services.some((s) => s.id === id)) return id;
    if (!name) return st.services[1]?.id ?? st.services[0].id;
    const label = name.split(" · ")[0].trim();
    const exact = st.services.find((s) => s.name === label);
    if (exact) return exact.id;
    const hits = st.services.filter((s) => label.includes(s.name) || s.name.includes(label) || (s.short && label.includes(s.short))).sort((a, b) => b.name.length - a.name.length);
    return (hits[0] ?? st.services[1] ?? st.services[0]).id;
  };
  /** ผู้บำบัดที่ผู้ป่วยเลือก: รหัสจากแอป → ชื่อตรงกัน · ไม่ระบุ = คนแรก */
  const therapistFor = (row: CloudAppt) => {
    const st = ref.current;
    const id = row.assessment?.therapistId;
    return (
      (id ? st.therapists.find((t) => t.id === id) : undefined) ??
      st.therapists.find((t) => row.therapist && (t.name === row.therapist || row.therapist.includes(t.name) || t.name.includes(row.therapist))) ??
      st.therapists[0]
    )?.id ?? "";
  };

  const inbound = (row: CloudAppt) => {
    const st = ref.current;
    known.current.set(row.id, row.status);
    if (row.plan?.summary) planSent.current.add(`${row.id}|${row.plan.summary}|${row.plan.course ? `${row.plan.course.used}/${row.plan.course.total}` : ""}`);
    if (row.status === "billed" && row.bill) billSig.current.set(row.id, JSON.stringify(row.bill));
    const local = st.appointments.find((a) => a.cloudId === row.id);
    if (row.status === "requested") {
      if (st.requests.some((r) => r.cloudId === row.id) || local) return;
      const p = patientFor(row);
      const as = row.assessment ?? {};
      const intake: Intake = {
        at: row.created_at,
        goal: "บรรเทาอาการ",
        complaint: as.complaint ?? p.complaint,
        pain: as.pain ?? 5,
        duration: "-",
        focusAreas: as.areas ?? [],
        avoidAreas: as.avoid ?? [],
        conditions: as.conditions ?? [],
        medications: [],
        bloodThinner: false,
        skin: "ปกติ",
        numbness: false,
        fever: !!as.screening?.fever,
        pregnant: as.screening?.pregnant ?? null,
        pressure: (["เบา", "ปานกลาง", "หนัก"].includes(as.pressure ?? "") ? as.pressure : "ปานกลาง") as Intake["pressure"],
      };
      const req: BookingRequest = {
        id: `rq-${row.id}`,
        cloudId: row.id,
        patientId: p.id,
        serviceId: serviceFor(row.service, as.serviceId),
        therapistId: therapistFor(row),
        date: row.date ?? todayISO(),
        start: row.start ?? "10:00",
        painScore: as.pain ?? 5,
        screening: { fever: !!as.screening?.fever, highBP: !!as.screening?.highBP, bpSystolic: as.screening?.bpSystolic, menstruation: !!as.screening?.menstruation, pregnant: !!as.screening?.pregnant, recentSurgery: !!as.screening?.recentSurgery, contagious: !!as.screening?.contagious },
        intake,
        note: as.summary ?? as.complaint,
        submittedAt: row.created_at,
      };
      st.dispatch({ type: "cloudRequest", request: req });
      toast({ message: `คำขอจองใหม่จากแอป · ${p.name}` });
      void pushNotify("คำขอจองใหม่จากแอป", `${p.name} · ${st.serviceById(req.serviceId).name} ${req.date} ${req.start} น.`, "/requests");
      return;
    }
    if (!local) {
      // นัดจากแอปที่ยืนยันแล้วใน cloud แต่ไม่มีในเครื่องนี้ (ข้อมูลในเครื่องถูกรีเซ็ต / อนุมัติจากอีกเครื่อง)
      // → สร้างกลับจาก cloud เพื่อให้เรียกคิว บันทึก ส่งบิล ไปถึงแอปได้ต่อ
      // (นัดที่คลินิกลงเองมีอยู่ในเครื่องแล้ว — แถว cloud สร้างตามหลัง ไม่ดึงซ้ำ)
      if (["confirmed", "checked_in"].includes(row.status) && row.date && row.start && row.assessment?.source !== "clinic" && !st.requests.some((r) => r.cloudId === row.id) && !adopting.current.has(row.id)) {
        adopting.current.add(row.id);
        const p = patientFor(row);
        st.dispatch({
          type: "schedule",
          items: [{ patientId: p.id, serviceId: serviceFor(row.service, row.assessment?.serviceId), therapistId: therapistFor(row), date: row.date, start: row.start, status: "waiting", type: "booked", painBefore: row.assessment?.pain ?? 5, paid: false, cloudId: row.id, note: "นัดจากแอป ThaiWell AI (ดึงจาก cloud)", log: [{ at: new Date().toISOString(), label: row.queue_no ? `เช็กอินจากแอป · คิว ${row.queue_no}` : "นัดจากแอป ThaiWell AI" }] }],
        });
        known.current.set(row.id, row.status);
        slotSig.current.set(row.id, `${row.date}|${row.start}|${row.therapist ?? ""}`);
        return;
      }
      // cancelled in the app before the clinic answered → the pending request goes away
      const req = st.requests.find((r) => r.cloudId === row.id);
      if (req && row.status === "cancelled") {
        st.dispatch({ type: "reject", id: req.id, reason: row.note ?? "ผู้ป่วยยกเลิกจากแอป" });
        void pushNotify("ผู้ป่วยยกเลิกคำขอจอง", `${st.patientById(req.patientId).name} · ${req.date} ${req.start} น.`, "/requests");
      }
      return;
    }
    // นัดที่ยืนยันแล้วและยังไม่เริ่ม: วัน/เวลา/ผู้บำบัดใน cloud คือค่าที่ทั้งสองระบบใช้ร่วมกัน
    if (row.status === "confirmed" && row.date && row.start) {
      const sig = `${row.date}|${row.start}|${row.therapist ?? ""}`;
      if (slotSig.current.get(row.id) !== sig) {
        slotSig.current.set(row.id, sig);
        const t = st.therapists.find((x) => x.name === row.therapist);
        if (local.status === "waiting" && !local.calledAt && (local.date !== row.date || local.start !== row.start || (t && t.id !== local.therapistId)))
          st.dispatch({ type: "updateAppointment", id: local.id, patch: { date: row.date, start: row.start, ...(t ? { therapistId: t.id } : {}) }, log: `ตรงกับนัดในแอป ${row.date} ${row.start} น.` });
      }
    }
    syncPhoto(st.patientById(local.patientId), row.tw_patients);
    // นัดที่อนุมัติก่อนมีการเก็บแบบคัดกรอง → เติมจากที่ผู้ป่วยตอบในแอป
    const sc = row.assessment?.screening;
    if (!local.screening && sc)
      st.dispatch({ type: "updateAppointment", id: local.id, patch: { screening: { fever: !!sc.fever, highBP: !!sc.highBP, bpSystolic: sc.bpSystolic, menstruation: !!sc.menstruation, pregnant: !!sc.pregnant, recentSurgery: !!sc.recentSurgery, contagious: !!sc.contagious } } });
    const who = st.patientById(local.patientId).name;
    // เช็กอินต้องสแกน QR ที่เคาน์เตอร์ (เปลี่ยนทุก 30 วินาที = มาถึงคลินิกจริง) · รหัสผิด/หมดอายุ/ไม่ใช่วันนัด → ส่งกลับให้สแกนใหม่
    if (row.status === "checked_in" && !DEMO && !local.log?.some((l) => l.label.startsWith("เช็กอินจากแอป"))) {
      const token = /^checkin:([A-Za-z0-9]+)/.exec(row.note ?? "")?.[1]?.toUpperCase();
      const secret = st.settings.checkinSecret;
      const reason = local.date !== todayISO() ? "นัดนี้ไม่ใช่วันนี้" : !token ? "ต้องสแกน QR เช็กอินที่เคาน์เตอร์" : !secret || !validCheckinCode(secret, token) ? "รหัส QR หมดอายุหรือไม่ถูกต้อง" : null;
      if (reason) {
        known.current.set(row.id, "confirmed");
        void updateAppt(row.id, { status: "confirmed", note: `checkin-rejected: ${reason} · สแกน QR ที่เคาน์เตอร์อีกครั้ง` });
        void logEvent("clinic", "checkin.rejected", row, row.tw_patients?.name, `เช็กอินไม่ผ่าน · ${reason}`);
        return;
      }
    }
    if (row.status === "checked_in" && !local.checkinQueue && !local.log?.some((l) => l.label.startsWith("เช็กอินจากแอป")) && !issuing.current.has(row.id)) {
      // เลขคิวรันตามลำดับคนมาเช็กอินของวันนี้ (Q001, Q002, …) · ถ้าเครื่องอื่นของคลินิกออกให้ไปแล้ว ใช้ของเดิม
      issuing.current.add(row.id);
      const day = todayISO();
      const last = Math.max(lastQueue.current.get(day) ?? 0, ...st.appointments.filter((x) => x.date === day && x.checkinQueue).map((x) => Number(x.checkinQueue!.slice(1)) || 0));
      const q = row.queue_no?.startsWith("Q") ? row.queue_no : `Q${String(last + 1).padStart(3, "0")}`;
      lastQueue.current.set(day, Math.max(last, Number(q.slice(1)) || 0));
      void (async () => {
        let issued = q;
        if (!row.queue_no) {
          // ออกเลขได้ครั้งเดียว (กันสองเครื่องออกซ้ำ)
          const { data } = await cloud.from("tw_appointments").update({ queue_no: q }).eq("id", row.id).is("queue_no", null).select("queue_no");
          if (!data?.length) {
            const { data: cur } = await cloud.from("tw_appointments").select("queue_no").eq("id", row.id).single();
            issued = (cur?.queue_no as string) ?? q;
          } else void logEvent("clinic", "queue.issued", row, row.tw_patients?.name, `เช็กอินแล้ว ออกเลขคิว ${q} ส่งไปแสดงในแอป`);
        }
        issuing.current.delete(row.id);
        // เครื่องอื่นของคลินิกออกเลขให้แล้ว → ข้อมูลนัดตามมาเอง (ไม่บันทึกซ้ำ)
        if (issued !== q && !row.queue_no) return;
        ref.current.dispatch({ type: "updateAppointment", id: local.id, patch: { checkinQueue: issued, checkedInAt: new Date().toISOString() }, log: `เช็กอินจากแอป · คิว ${issued}` });
        if (issued === q) {
          toast({ message: `${who} เช็กอินแล้ว · คิว ${issued}` });
          void pushNotify("เช็กอินจากแอป", `${who} มาถึงแล้ว · คิว ${issued}`, "/visits");
        }
      })();
    }
    if (row.bill?.status === "paid" && row.bill.via === "app" && local.payment?.status === "pending") {
      st.dispatch({ type: "updateAppointment", id: local.id, patch: { payment: { ...local.payment, status: "paid", at: row.bill.paid_at ?? new Date().toISOString() }, paid: true, status: "done" }, log: "ชำระเงินผ่านแอปแล้ว" });
      known.current.set(row.id, "paid");
      toast({ message: `${who} ชำระผ่านแอปแล้ว ${row.bill.amount} บาท` });
      void pushNotify("ชำระผ่านแอปแล้ว", `${who} · ${row.bill.amount} บาท`, "/billing");
    }
    if (row.status === "cancelled" && local.status !== "cancelled" && !local.startedAt) {
      st.dispatch({ type: "updateAppointment", id: local.id, patch: { status: "cancelled", cancel: { at: new Date().toISOString(), by: "patient", reason: row.note ?? "ยกเลิกจากแอป", staff: "แอป ThaiWell AI" } }, log: "ผู้ป่วยยกเลิกนัดจากแอป" });
      void pushNotify("ผู้ป่วยยกเลิกนัดจากแอป", `${who} · ${local.date} ${local.start} น.`, "/appointments");
    }
  };

  // first load + live updates
  useEffect(() => {
    let alive = true;
    const join = "*, tw_patients(*)";
    // ข้อมูลสาธิตชุดเดียวกับแอป: รีเซ็ตที่ขอไว้ → ใส่ใหม่ทั้งหมด · ครั้งแรก → ใส่ส่วนที่ยังไม่มี
    // ข้อมูลสาธิต (เฉพาะโหมดสาธิต/ทดสอบ) · ใช้งานจริงไม่แตะ cloud
    void (!DEMO ? Promise.resolve() : takeDemoReseed() ? resetDemoCloud(ref.current) : ensureDemoCloud(ref.current))
      .catch(() => undefined)
      .then(() => cloud
      .from("tw_appointments")
      .select(join)
      .not("status", "in", "(closed,rejected,cancelled)")
      .order("created_at")
      .then(({ data }) => {
        if (!alive) return;
        (data as CloudAppt[] | null)?.forEach(inbound);
        setReady(true);
      }));
    // เวลาว่างจริงของคลินิก → แอปบนมือถือใช้จองรอบที่ว่างจริง
    const avail = window.setInterval(() => {
      try {
        void publishCloudAvailability(localStorage.getItem(AVAILABILITY_KEY)).catch(() => undefined);
      } catch {
        /* storage unavailable */
      }
    }, 3000);
    const ch = cloud
      .channel("tw-clinic")
      // ผู้ใช้เปลี่ยนรูปโปรไฟล์ในแอป (ไม่ต้องรอจองครั้งถัดไป)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "tw_patients" }, (ev) => {
        const cp = ev.new as NonNullable<CloudAppt["tw_patients"]>;
        const p = ref.current.patients.find((x) => x.cloudId === cp?.id);
        if (p) syncPhoto(p, cp);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "tw_appointments" }, async (ev) => {
        const id = (ev.new as CloudAppt)?.id;
        if (!id) return;
        const { data } = await cloud.from("tw_appointments").select(join).eq("id", id).single();
        if (data) inbound(data as CloudAppt);
      })
      // notes the app sends outside a booking (pre-visit self-check, how the patient felt afterwards, complaints) become notifications
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "tw_events", filter: "kind=eq.app.note" }, (ev) => {
        const row = ev.new as CloudEvent;
        const p = (row.payload ?? {}) as { title?: string; body?: string; patientId?: string };
        if (row.source !== "app" || !p.title) return;
        const local = p.patientId ? ref.current.patients.find((x) => x.cloudId === p.patientId) : undefined;
        ref.current.dispatch({ type: "bridgeIn", event: { id: `ev${row.id}`, at: row.at, type: "note", title: p.title, body: p.body ?? row.summary ?? "", patientId: local?.id } });
        void pushNotify(p.title, p.body ?? row.summary ?? "", local ? "/patients" : undefined);
      })
      .subscribe();
    // สำรอง: realtime หลุดได้ (iPad พักหน้าจอ / Wi-Fi) → ตรวจการจองที่ยังไม่จบทุก 5 วินาที
    const poll = window.setInterval(async () => {
      const open = [...known.current].filter(([, st]) => !["paid", "closed", "rejected", "cancelled", "no_show"].includes(st)).map(([id]) => id);
      if (!open.length) return;
      const { data } = await cloud.from("tw_appointments").select(join).in("id", open);
      (data as CloudAppt[] | null)?.forEach((r) => {
        if (r.status !== known.current.get(r.id) || r.status === "checked_in") inbound(r);
      });
    }, 5000);
    return () => {
      alive = false;
      window.clearInterval(poll);
      window.clearInterval(avail);
      void cloud.removeChannel(ch);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // นัดที่คลินิกลงเอง (นัดตามคอร์ส / จัดตารางนัด / นัดหน้าร้าน) ของผู้ป่วยที่ใช้แอป → ส่งไปแสดงในแอปของเจ้าของ
  // เป็นแถวใน cloud แบบเดียวกับนัดจากแอป → เช็กอิน เรียกคิว ผลการรักษา บิล ไปถึงแอปทางเดิมทั้งหมด
  useEffect(() => {
    if (!ready || DEMO) return;
    const today = todayISO();
    for (const a of store.appointments) {
      if (a.cloudId || a.status !== "waiting" || a.startedAt || a.date < today) continue;
      const p = store.patientById(a.patientId);
      if (!p.cloudId) continue;
      const id = `cl-${a.id}`;
      if (creating.current.has(id)) continue;
      creating.current.add(id);
      const s = store.serviceById(a.serviceId);
      const t = store.therapistById(a.therapistId);
      // ครั้งที่เท่าไหร่ของคอร์ส (นัดของบริการตามคอร์ส ตั้งแต่เปิดคอร์ส เรียงตามวัน)
      const c = p.course && p.course.serviceId === a.serviceId ? p.course : undefined;
      const no = c
        ? store.appointments.filter((x) => x.patientId === p.id && x.serviceId === c.serviceId && x.status !== "cancelled" && x.status !== "absent" && x.date >= c.startedOn && `${x.date}${x.start}` <= `${a.date}${a.start}`).length
        : 0;
      const course = c ? { name: c.name, no, total: c.total } : undefined;
      void Promise.resolve(
        cloud.from("tw_appointments").upsert(
          {
            id,
            patient_id: p.cloudId,
            status: "confirmed",
            service: s.name,
            date: a.date,
            start: a.start,
            therapist: t.name,
            assessment: { source: "clinic", serviceId: s.id, therapistId: t.id, ...(course ? { course } : {}), summary: course ? `นัดตามคอร์ส ${course.name} ครั้งที่ ${no}/${course.total}` : "นัดจากคลินิก" },
          },
          { onConflict: "id", ignoreDuplicates: true },
        ),
      ).then(({ error }) => {
        if (error) return void creating.current.delete(id);
        known.current.set(id, "confirmed");
        slotSig.current.set(id, `${a.date}|${a.start}|${t.name}`);
        ref.current.dispatch({ type: "updateAppointment", id: a.id, patch: { cloudId: id }, log: "ส่งนัดไปแสดงในแอป ThaiWell AI ของผู้ป่วย" });
        void logEvent("clinic", "booking.clinic", { id }, p.name, `คลินิกลงนัด ${a.date} ${a.start} น. · ${s.name}${course ? ` · คอร์ส ครั้งที่ ${no}/${course.total}` : ""}`);
      });
    }
  }, [ready, store.appointments]); // eslint-disable-line react-hooks/exhaustive-deps

  // HN + คอร์สของผู้ป่วยที่ใช้แอป (ชื่อ จำนวนครั้ง ใช้ไป หมดอายุ) → แสดงในแอปของเจ้าของ
  useEffect(() => {
    if (!ready || DEMO) return;
    for (const p of store.patients) {
      if (!p.cloudId) continue;
      const c = p.course;
      const course = c ? { name: c.name, service: store.serviceById(c.serviceId).name, total: c.total, used: c.used, startedOn: c.startedOn, expiresOn: c.expiresOn } : null;
      const sig = JSON.stringify(course);
      if (courseSig.current.get(p.cloudId) === `${p.hn}|${sig}`) continue;
      courseSig.current.set(p.cloudId, `${p.hn}|${sig}`);
      const cid = p.cloudId;
      const hn = p.hn;
      void (async () => {
        const { data } = await cloud.from("tw_patients").select("profile,clinic_hn").eq("id", cid).maybeSingle();
        if (!data) return;
        const prof = (data.profile ?? {}) as { course?: unknown };
        const sameCourse = JSON.stringify(prof.course ?? null) === sig;
        // HN ของคลินิกไปแสดงในโปรไฟล์แอปด้วย
        if (sameCourse && data.clinic_hn === hn) return;
        await cloud.from("tw_patients").update({ clinic_hn: hn, ...(sameCourse ? {} : { profile: { ...prof, course } }) }).eq("id", cid);
      })();
    }
  }, [ready, store.patients]); // eslint-disable-line react-hooks/exhaustive-deps

  // clinic → app: push every forward step of a linked booking
  useEffect(() => {
    if (!ready) return;
    for (const a of store.appointments) {
      if (!a.cloudId) continue;
      const was = known.current.get(a.cloudId);
      if (!was) continue; // finished / unknown in the cloud — leave it
      const d = derive(store, a);
      // เลื่อนนัดในหลังบ้าน (ยังไม่ถึงคิว) → แจ้งแอปวัน/เวลา/ผู้บำบัดใหม่
      if (was === "confirmed" && d.status === "confirmed") {
        const t = store.therapistById(a.therapistId).name;
        const sig = `${a.date}|${a.start}|${t}`;
        const prev = slotSig.current.get(a.cloudId);
        if (prev && prev !== sig) {
          slotSig.current.set(a.cloudId, sig);
          const name = store.patientById(a.patientId).name;
          void updateAppt(a.cloudId, { date: a.date, start: a.start, therapist: t }).then(() => logEvent("clinic", "booking.moved", { id: a.cloudId! }, name, `เลื่อนนัดเป็น ${a.date} ${a.start} น. · ${t}`));
        }
        continue;
      }
      const name = store.patientById(a.patientId).name;
      // แก้ยอดบิลระหว่างรอชำระ → แอปได้ยอดใหม่
      if (was === "billed" && d.status === "billed") {
        const sig = JSON.stringify(d.patch.bill);
        if (billSig.current.get(a.cloudId) !== sig) {
          const first = !billSig.current.has(a.cloudId);
          billSig.current.set(a.cloudId, sig);
          if (!first) void updateAppt(a.cloudId, d.patch).then(() => logEvent("clinic", "bill.updated", { id: a.cloudId! }, name, `แก้บิลเป็น ${d.patch.bill?.amount ?? 0} บาท`));
        }
        continue;
      }
      const back = d.status === "cancelled" || d.status === "no_show";
      // เลิกยกเลิก / เลิกบันทึกไม่มา → นัดกลับมาในแอป
      const revive = (was === "cancelled" || was === "no_show") && !back;
      // ยกเลิกใบเสร็จ → บิลเดิมในแอปถูกยกเลิก (รอชำระใหม่)
      const voided = (was === "paid" || was === "billed") && d.status === "recorded";
      if (was === d.status || (!back && !revive && !voided && rank(d.status) <= rank(was))) continue;
      known.current.set(a.cloudId, d.status);
      if (d.patch.bill) billSig.current.set(a.cloudId, JSON.stringify(d.patch.bill));
      void updateAppt(a.cloudId, { status: d.status, ...d.patch, ...(voided ? { bill: null } : {}), ...(revive ? { note: null } : {}) })
        .then(() => logEvent("clinic", voided ? "bill.voided" : revive ? "booking.restored" : d.kind, { id: a.cloudId! }, name, voided ? "ยกเลิกใบเสร็จ · รอชำระใหม่" : revive ? `คืนนัด ${a.date} ${a.start} น.` : d.summary))
        .catch(() => known.current.set(a.cloudId!, was ?? "requested"));
    }
    for (const dec of store.decisions) {
      const id = dec.request.cloudId;
      if (!id || dec.outcome !== "rejected" || known.current.get(id) !== "requested") continue;
      known.current.set(id, "rejected");
      void updateAppt(id, { status: "rejected", note: dec.reason }).then(() => logEvent("clinic", "booking.rejected", { id }, store.patientById(dec.request.patientId).name, `ปฏิเสธคำขอจอง · ${dec.reason ?? ""}`));
    }
    // an approved treatment plan goes to the patient's app
    for (const p of store.patients) {
      if (!p.cloudId || !p.aiPlan?.approved) continue;
      const appt = [...store.appointments].reverse().find((a) => a.patientId === p.id && a.cloudId && known.current.has(a.cloudId));
      const course = p.course ? { name: p.course.name, total: p.course.total, used: p.course.used } : undefined;
      const key = `${appt?.cloudId}|${p.aiPlan.summary}|${course ? `${course.used}/${course.total}` : ""}`;
      if (!appt?.cloudId || planSent.current.has(key)) continue;
      planSent.current.add(key);
      const pl = p.aiPlan;
      void updateAppt(appt.cloudId, { plan: { summary: pl.summary, sessions: pl.sessions, frequency: pl.frequency, phases: pl.phases.map((x) => ({ title: x.title, weeks: x.weeks, focus: x.focus })), homeCare: pl.homeCare, ...(course ? { course } : {}) } }).then(() =>
        logEvent("clinic", "plan.shared", { id: appt.cloudId! }, p.name, `ส่งแผนการรักษา ${pl.sessions} ครั้ง (${pl.frequency}) ไปแสดงในแอป`),
      );
    }
  }, [ready, store.appointments, store.decisions, store.patients]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
