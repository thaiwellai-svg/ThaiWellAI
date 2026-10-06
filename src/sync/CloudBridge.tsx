import { useEffect, useRef, useState } from "react";
import { useStore } from "../store/store";
import { useToast } from "../design-system";
import { queueNumber } from "../features/AppointmentDrawer";
import { todayISO } from "../data/thaiDate";
import type { Appointment, BookingRequest, Intake, Patient } from "../data/types";
import { AVAILABILITY_KEY } from "../features/appBridge";
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
  if (pay?.status === "pending") return { status: "billed", patch: { bill: { amount: pay.amount, items: [s.name], status: "pending", via: "app" } }, kind: "bill.sent", summary: `ส่งบิล ${pay.amount} บาท ไปเรียกเก็บในแอป` };
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
  if (a.calledAt) return { status: "called", patch: { queue_no: queueNumber(store.appointments, a) }, kind: "queue.called", summary: `เรียกคิว ${queueNumber(store.appointments, a)} เข้ารับบริการ` };
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
  const adopting = useRef(new Set<string>()); // cloud ids whose booking already carries the current plan
  // nothing is pushed until the cloud's current state has been read
  const [ready, setReady] = useState(false);

  /** the local patient for an app account (registered on first booking) */
  const patientFor = (row: CloudAppt): Patient => {
    const st = ref.current;
    const cp = row.tw_patients;
    const digits = cp?.phone?.replace(/\D/g, "") ?? "";
    const found = st.patients.find((p) => p.cloudId === row.patient_id) ?? (digits.length >= 9 ? st.patients.find((p) => p.phone.replace(/\D/g, "") === digits) : undefined);
    if (found) {
      if (!found.cloudId) st.dispatch({ type: "updatePatient", id: found.id, patch: { cloudId: row.patient_id } });
      return found;
    }
    const p: Patient = {
      id: `pc${Date.now().toString(36)}`,
      hn: `HN${String(641_000 + st.patients.length).padStart(7, "0")}`,
      name: cp?.name ?? "ผู้ใช้แอป",
      gender: cp?.gender === "ชาย" ? "ชาย" : "หญิง",
      age: cp?.age ?? 30,
      phone: cp?.phone ?? "",
      conditions: row.assessment?.conditions ?? [],
      complaint: row.assessment?.complaint ?? "",
      painHistory: [],
      registeredOn: todayISO(),
      cloudId: row.patient_id,
    };
    st.dispatch({ type: "addPatient", patient: p });
    void cloud.from("tw_patients").update({ clinic_hn: p.hn }).eq("id", row.patient_id);
    return p;
  };

  const serviceFor = (name?: string | null) => {
    const st = ref.current;
    if (!name) return st.services[1]?.id ?? st.services[0].id;
    return (st.services.find((s) => name.includes(s.name) || s.name.includes(name) || name.includes(s.short)) ?? st.services[1] ?? st.services[0]).id;
  };

  const inbound = (row: CloudAppt) => {
    const st = ref.current;
    known.current.set(row.id, row.status);
    if (row.plan?.summary) planSent.current.add(`${row.id}|${row.plan.summary}`);
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
        serviceId: serviceFor(row.service),
        // ผู้บำบัดที่ผู้ป่วยเลือกในแอป (ตามชื่อ) · ไม่ระบุ = คนแรก
        therapistId: st.therapists.find((t) => row.therapist && (t.name === row.therapist || row.therapist.includes(t.name) || t.name.includes(row.therapist)))?.id ?? st.therapists[0].id,
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
      if (["confirmed", "checked_in"].includes(row.status) && row.date && row.start && !st.requests.some((r) => r.cloudId === row.id) && !adopting.current.has(row.id)) {
        adopting.current.add(row.id);
        const p = patientFor(row);
        const t = st.therapists.find((x) => x.name === row.therapist) ?? st.therapists[0];
        st.dispatch({
          type: "schedule",
          items: [{ patientId: p.id, serviceId: serviceFor(row.service), therapistId: t.id, date: row.date, start: row.start, status: "waiting", type: "booked", painBefore: row.assessment?.pain ?? 5, paid: false, cloudId: row.id, note: "นัดจากแอป ThaiWell AI (ดึงจาก cloud)", log: [{ at: new Date().toISOString(), label: row.queue_no ? `เช็กอินจากแอป · คิว ${row.queue_no}` : "นัดจากแอป ThaiWell AI" }] }],
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
    const who = st.patientById(local.patientId).name;
    if (row.status === "checked_in" && !local.log?.some((l) => l.label.startsWith("เช็กอินจากแอป"))) {
      const q = queueNumber(st.appointments, local);
      st.dispatch({ type: "updateAppointment", id: local.id, patch: {}, log: `เช็กอินจากแอป · คิว ${q}` });
      void updateAppt(row.id, { queue_no: q });
      void logEvent("clinic", "queue.issued", row, row.tw_patients?.name, `ออกเลขคิว ${q} ส่งไปแสดงในแอป`);
      toast({ message: `${who} เช็กอินจากแอปแล้ว · คิว ${q}` });
      void pushNotify("เช็กอินจากแอป", `${who} มาถึงแล้ว · คิว ${q}`, "/visits");
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
    void (takeDemoReseed() ? resetDemoCloud(ref.current) : ensureDemoCloud(ref.current))
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
      const back = d.status === "cancelled" || d.status === "no_show";
      if (was === d.status || (!back && rank(d.status) <= rank(was))) continue;
      known.current.set(a.cloudId, d.status);
      const name = store.patientById(a.patientId).name;
      void updateAppt(a.cloudId, { status: d.status, ...d.patch })
        .then(() => logEvent("clinic", d.kind, { id: a.cloudId! }, name, d.summary))
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
      const key = `${appt?.cloudId}|${p.aiPlan.summary}`;
      if (!appt?.cloudId || planSent.current.has(key)) continue;
      planSent.current.add(key);
      const pl = p.aiPlan;
      void updateAppt(appt.cloudId, { plan: { summary: pl.summary, sessions: pl.sessions, frequency: pl.frequency, phases: pl.phases.map((x) => ({ title: x.title, weeks: x.weeks, focus: x.focus })), homeCare: pl.homeCare } }).then(() =>
        logEvent("clinic", "plan.shared", { id: appt.cloudId! }, p.name, `ส่งแผนการรักษา ${pl.sessions} ครั้ง (${pl.frequency}) ไปแสดงในแอป`),
      );
    }
  }, [ready, store.appointments, store.decisions, store.patients]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
