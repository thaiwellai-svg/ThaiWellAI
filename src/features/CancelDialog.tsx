import { useEffect, useMemo, useState } from "react";
import { CalendarX2, Check, Info, Ticket } from "lucide-react";
import { clsx } from "clsx";
import { Avatar, Button, Chip, Dialog, Field, Switch, Textarea, useToast } from "../design-system";
import { notifyWaitlist } from "./Waitlist";
import { useStore } from "../store/store";
import { patientPhoto } from "../data/avatars";
import { thaiDateShort, todayISO } from "../data/thaiDate";
import type { Appointment } from "../data/types";
import "./cancel-dialog.css";

const REASONS = {
  patient: ["ไม่สบาย", "ติดธุระ", "เดินทางไม่สะดวก", "อาการดีขึ้นแล้ว", "ขอเลื่อนไปก่อน", "อื่น ๆ"],
  clinic: ["ผลคัดกรองไม่ผ่าน", "ผู้บำบัดลา / ไม่ว่าง", "เตียงหรือห้องไม่พร้อม", "คลินิกปิดทำการ", "อื่น ๆ"],
};

/** Cancel one appointment — or, when it belongs to a treatment plan, every remaining appointment of that plan. */
export function CancelDialog({ appt, onClose, onRebook, planFirst }: { appt: Appointment | null; onClose: () => void; onRebook?: (a: Appointment) => void; /** open with "cancel the whole plan" selected */ planFirst?: boolean }) {
  const store = useStore();
  const toast = useToast();
  const [by, setBy] = useState<"patient" | "clinic">("patient");
  const [reason, setReason] = useState(REASONS.patient[0]);
  const [note, setNote] = useState("");
  // ids of plan sessions picked for cancelling (any subset of the plan)
  const [picked, setPicked] = useState<string[]>([]);
  const [notify, setNotify] = useState(true);
  useEffect(() => {
    if (!appt) return;
    setBy("patient");
    setReason(REASONS.patient[0]);
    setNote("");
    setPicked([]);
    setNotify(true);
  }, [appt?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const p = appt ? store.patientById(appt.patientId) : null;
  // remaining appointments of the same treatment plan (same course service, not started yet)
  const plan = useMemo(() => {
    // every booked session holds a course credit (see creditInfo), so the plan = all upcoming sessions not started yet
    if (!appt || !p?.course) return [];
    return store.appointments
      .filter((a) => a.patientId === p.id && a.status === "waiting" && !a.startedAt && !a.calledAt && a.date >= todayISO())
      .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  }, [appt, p, store.appointments]);
  useEffect(() => {
    if (!appt) return;
    setPicked(planFirst ? plan.map((a) => a.id) : [appt.id]);
  }, [appt?.id, plan.length]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!appt || !p) return null;
  const s = store.serviceById(appt.serviceId);
  const targets = plan.length > 1 ? plan.filter((a) => picked.includes(a.id)) : [appt];
  const all = plan.length > 1 && targets.length === plan.length;
  const toggle = (id: string) => setPicked((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  const paid = targets.filter((a) => a.paid && a.payment);

  const confirm = () => {
    const at = new Date().toISOString();
    const batch = targets.length > 1 ? at : undefined;
    const why = `${reason}${note.trim() ? ` · ${note.trim()}` : ""}`;
    const before = targets.map((a) => ({ ...a }));
    for (const a of targets) {
      if (a.paid && a.payment) store.dispatch({ type: "voidPayment", id: a.id, reason: `ยกเลิกนัด · ${reason}`, refund: true });
      store.dispatch({
        type: "updateAppointment",
        id: a.id,
        patch: { status: "cancelled", cancel: { at, by, reason, note: note.trim() || undefined, staff: store.settings.staffName, batch } },
        log: `ยกเลิกนัด ${thaiDateShort(a.date)} ${a.start} น. · ${by === "patient" ? "ผู้ป่วยแจ้ง" : "คลินิกยกเลิก"} · ${why}`,
      });
    }
    const waiting = notifyWaitlist(store, targets.map((a) => ({ date: a.date, start: a.start, patientId: a.patientId })));
    toast({
      message: (waiting ? `แจ้งคนรอคิว ${waiting} คนผ่านแอปแล้ว · ` : "") + (targets.length > 1 ? `ยกเลิก ${targets.length} นัดแล้ว${p.course ? ` · คืนเครดิตให้ ${targets.length} ครั้ง` : ""}` : `ยกเลิกนัด ${thaiDateShort(targets[0].date)} ${targets[0].start} น. แล้ว${notify ? " · แจ้งผู้ป่วยผ่านแอปแล้ว" : ""}`),
      action: { label: "เลิกทำ", onClick: () => before.forEach((a) => store.dispatch({ type: "restoreAppointment", appointment: a })) },
    });
    onClose();
    if (onRebook && targets.length === 1 && by === "clinic") onRebook(appt);
  };

  return (
    <Dialog
      open={!!appt}
      onClose={onClose}
      className="cx"
      leading={<Avatar name={p.name} src={patientPhoto(p)} size="card" shape="squircle" />}
      title="ยกเลิกนัด"
      subtitle={`${p.name} · ${thaiDateShort(appt.date)} ${appt.start} น. · ${s.name}`}
      footer={
        <>
          <Button variant="outline" size="md" onClick={onClose}>
            กลับ
          </Button>
          <Button variant="danger" size="md" leading={<CalendarX2 size={16} />} disabled={targets.length === 0} onClick={confirm}>
            {targets.length === 0 ? "เลือกวันที่จะยกเลิก" : targets.length > 1 ? `ยกเลิก ${targets.length} นัด` : "ยืนยันยกเลิกนัด"}
          </Button>
        </>
      }
    >
      {plan.length > 1 && (
        <section className="cx__sec">
          <h3>นัดนี้อยู่ในแผนการรักษา · {p.course!.name}</h3>
          <div className="cx__scope">
            <button type="button" aria-pressed={targets.length === 1 && picked[0] === appt.id} onClick={() => setPicked([appt.id])}>
              <i>{targets.length === 1 && picked[0] === appt.id && <Check size={12} strokeWidth={3} />}</i>
              <span>
                <b>เฉพาะนัดนี้</b>
                <small>
                  {thaiDateShort(appt.date)} {appt.start} น.
                </small>
              </span>
            </button>
            <button type="button" aria-pressed={all} onClick={() => setPicked(plan.map((a) => a.id))}>
              <i>{all && <Check size={12} strokeWidth={3} />}</i>
              <span>
                <b>ทั้งหมด · {plan.length} นัด</b>
                <small>ทุกนัดตามแผนที่ยังไม่ได้รับบริการ</small>
              </span>
            </button>
          </div>
          <p className="cx__hint">หรือแตะเลือกวันที่ต้องการยกเลิก · เลือกแล้ว {targets.length} จาก {plan.length} นัด</p>
          <div className="cx__dates">
            {plan.map((a) => {
              const on = picked.includes(a.id);
              return (
                <button key={a.id} type="button" aria-pressed={on} className={a.id === appt.id ? "is-this" : undefined} onClick={() => toggle(a.id)}>
                  <i>{on && <Check size={11} strokeWidth={3} />}</i>
                  {thaiDateShort(a.date)} · {a.start}
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="cx__sec">
        <h3>ใครเป็นผู้ยกเลิก</h3>
        <div className="cx__seg">
          {(["patient", "clinic"] as const).map((x) => (
            <button
              key={x}
              type="button"
              aria-pressed={by === x}
              onClick={() => {
                setBy(x);
                setReason(REASONS[x][0]);
              }}
            >
              {x === "patient" ? "ผู้ป่วยแจ้งยกเลิก" : "คลินิกยกเลิก"}
            </button>
          ))}
        </div>
      </section>

      <section className="cx__sec">
        <h3>เหตุผล</h3>
        <div className="reasons">
          {REASONS[by].map((r) => (
            <Chip key={r} pressed={reason === r} onClick={() => setReason(r)}>
              {r}
            </Chip>
          ))}
        </div>
        <Field label="หมายเหตุ (ไม่บังคับ)">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น ผู้ป่วยจะโทรกลับมานัดใหม่" />
        </Field>
      </section>

      <div className="cx__info">
        <p>
          <Info size={15} /> เวลาและเตียงที่จองไว้จะว่างให้คนอื่นจองได้ทันที
        </p>
        {p.course && (
          <p>
            <Ticket size={15} /> คืนเครดิตคอร์สให้ {targets.length} ครั้ง (ยังไม่ถูกหัก)
          </p>
        )}
        {paid.length > 0 && <p className="is-warn">ชำระเงินแล้ว {paid.length} นัด · ระบบจะยกเลิกใบเสร็จและบันทึกการคืนเงิน</p>}
      </div>

      <div className={clsx("cx__notify", notify && "is-on")}>
        <span>
          <b>แจ้งผู้ป่วยผ่านแอป ThaiWell AI</b>
          <small>ส่งข้อความยกเลิกนัดพร้อมเหตุผล</small>
        </span>
        <Switch checked={notify} onChange={setNotify} label="แจ้งผู้ป่วย" />
      </div>
    </Dialog>
  );
}
