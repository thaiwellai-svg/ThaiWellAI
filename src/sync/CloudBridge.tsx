import { useEffect, useRef, useState } from "react";
import { useStore } from "../store/store";
import { useToast } from "../design-system";
import { queueNumber } from "../features/AppointmentDrawer";
import { todayISO } from "../data/thaiDate";
import type { Appointment, BookingRequest, Intake, Patient } from "../data/types";
import { cloud, logEvent, rank, updateAppt, type CloudAppt, type CloudEvent, type CloudStatus } from "./cloud";

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
  const planSent = useRef(new Set<string>()); // cloud ids whose booking already carries the current plan
  // nothing is pushed until the cloud's current state has been read
  const [ready, setReady] = useState(false);

  /** the local patient for an app account (registered on first booking) */
  const patientFor = (row: CloudAppt): Patient => {
    const st = ref.current;
    const cp = row.tw_patients;
    const found = st.patients.find((p) => p.cloudId === row.patient_id) ?? (cp?.phone ? st.patients.find((p) => p.phone.replace(/\D/g, "") === cp.phone!.replace(/\D/g, "")) : undefined);
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
        therapistId: st.therapists[0].id,
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
      return;
    }
    if (!local) {
      // cancelled in the app before the clinic answered → the pending request goes away
      const req = st.requests.find((r) => r.cloudId === row.id);
      if (req && row.status === "cancelled") st.dispatch({ type: "reject", id: req.id, reason: row.note ?? "ผู้ป่วยยกเลิกจากแอป" });
      return;
    }
    if (row.status === "checked_in" && !local.log?.some((l) => l.label.startsWith("เช็กอินจากแอป"))) {
      const q = queueNumber(st.appointments, local);
      st.dispatch({ type: "updateAppointment", id: local.id, patch: {}, log: `เช็กอินจากแอป · คิว ${q}` });
      void updateAppt(row.id, { queue_no: q });
      void logEvent("clinic", "queue.issued", row, row.tw_patients?.name, `ออกเลขคิว ${q} ส่งไปแสดงในแอป`);
      toast({ message: `${st.patientById(local.patientId).name} เช็กอินจากแอปแล้ว · คิว ${q}` });
    }
    if (row.bill?.status === "paid" && row.bill.via === "app" && local.payment?.status === "pending") {
      st.dispatch({ type: "updateAppointment", id: local.id, patch: { payment: { ...local.payment, status: "paid", at: row.bill.paid_at ?? new Date().toISOString() }, paid: true, status: "done" }, log: "ชำระเงินผ่านแอปแล้ว" });
      known.current.set(row.id, "paid");
      toast({ message: `${st.patientById(local.patientId).name} ชำระผ่านแอปแล้ว ${row.bill.amount} บาท` });
    }
    if (row.status === "cancelled" && local.status !== "cancelled" && !local.startedAt) {
      st.dispatch({ type: "updateAppointment", id: local.id, patch: { status: "cancelled", cancel: { at: new Date().toISOString(), by: "patient", reason: row.note ?? "ยกเลิกจากแอป", staff: "แอป ThaiWell AI" } }, log: "ผู้ป่วยยกเลิกนัดจากแอป" });
    }
  };

  // first load + live updates
  useEffect(() => {
    let alive = true;
    const join = "*, tw_patients(*)";
    void cloud
      .from("tw_appointments")
      .select(join)
      .not("status", "in", "(closed,rejected,cancelled)")
      .order("created_at")
      .then(({ data }) => {
        if (!alive) return;
        (data as CloudAppt[] | null)?.forEach(inbound);
        setReady(true);
      });
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
      })
      .subscribe();
    return () => {
      alive = false;
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
