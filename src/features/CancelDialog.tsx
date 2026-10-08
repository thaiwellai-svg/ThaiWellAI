import { useEffect, useMemo, useState } from "react";
import { CalendarX2, Check, Info, Ticket } from "lucide-react";
import { clsx } from "clsx";
import { Avatar, Button, Chip, Dialog, Field, Switch, Textarea, useToast } from "../design-system";
import { notifyWaitlist } from "./Waitlist";
import { useStore } from "../store/store";
import { patientPhoto } from "../data/avatars";
import { thaiDateShort } from "../data/thaiDate";
import { courseUsage } from "../data/domain";
import type { Appointment } from "../data/types";
import "./cancel-dialog.css";

const REASONS = {
  patient: ["ไม่สบาย", "ติดธุระ", "เดินทางไม่สะดวก", "อาการดีขึ้นแล้ว", "ขอเลื่อนไปก่อน", "อื่น ๆ"],
  clinic: ["ผลคัดกรองไม่ผ่าน", "ผู้บำบัดลา / ไม่ว่าง", "เตียงหรือห้องไม่พร้อม", "คลินิกปิดทำการ", "เกินจำนวนครั้งในคอร์ส", "อื่น ๆ"],
};

/** ทุกการยกเลิกนัดผ่านหน้าต่างนี้ — Cancel one appointment — or, when it belongs to a treatment plan, any/every remaining appointment of that plan. */
export function CancelDialog({
  appt,
  onClose,
  onRebook,
  planFirst,
  preset,
}: {
  appt: Appointment | null;
  onClose: () => void;
  onRebook?: (a: Appointment) => void;
  /** open with "cancel the whole plan" selected */
  planFirst?: boolean;
  /** เลือกนัดและเหตุผลไว้ให้ก่อน (เช่น ยกเลิกนัดส่วนเกินคอร์ส) — ยังแก้ได้ก่อนยืนยัน */
  preset?: { ids: string[]; by: "patient" | "clinic"; reason: string };
}) {
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
    setBy(preset?.by ?? "patient");
    setReason(preset?.reason ?? REASONS[preset?.by ?? "patient"][0]);
    setNote("");
    setPicked([]);
    setNotify(true);
  }, [appt?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const p = appt ? store.patientById(appt.patientId) : null;
  // remaining appointments of the same treatment plan (same course service, not started yet)
  const plan = useMemo(() => {
    // นัดที่จองไว้ของคอร์ส (ตัวนับกลาง: บริการของคอร์ส ตั้งแต่วันเริ่ม) ที่ยังไม่เริ่ม
    // นัดที่กำลังยกเลิกอยู่ในรายการเสมอ (เรียกคิวแล้วแต่ยังไม่เริ่มนวด ยกเลิกได้)
    if (!appt || !p?.course) return [];
    const u = courseUsage(p, store.appointments);
    if (!u || !u.bookedVisits.some((a) => a.id === appt.id)) return [];
    return u.bookedVisits.filter((a) => a.status === "waiting" && !a.startedAt && (!a.calledAt || a.id === appt.id));
  }, [appt, p, store.appointments]);
  useEffect(() => {
    if (!appt) return;
    setPicked(preset ? preset.ids : planFirst ? plan.map((a) => a.id) : [appt.id]);
  }, [appt?.id, plan.length]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!appt || !p) return null;
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
        log: `ยกเลิกนัด ${thaiDateShort(a.date)} ${a.start} น. · ${by === "patient" ? "ผู้ป่วยยกเลิก" : "คลินิกยกเลิก"} · ${why}`,
      });
    }
    const waiting = notifyWaitlist(store, targets.map((a) => ({ date: a.date, start: a.start, patientId: a.patientId })));
    toast({
      message: (targets.length > 1 ? `ยกเลิก ${targets.length} นัดแล้ว` : `ยกเลิกนัด ${thaiDateShort(targets[0].date)} ${targets[0].start} น. แล้ว`) + (waiting ? ` · แจ้งคนรอคิว ${waiting} คน` : ""),
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
      subtitle={`${p.name} · ${thaiDateShort(appt.date)} ${appt.start} น.`}
      footer={
        <>
          <Button variant="outline" size="md" onClick={onClose}>
            ปิด
          </Button>
          <Button variant="danger" size="md" leading={<CalendarX2 size={16} />} disabled={targets.length === 0} onClick={confirm}>
            {targets.length === 0 ? "เลือกนัดที่จะยกเลิก" : targets.length > 1 ? `ยกเลิก ${targets.length} นัด` : "ยืนยันยกเลิกนัด"}
          </Button>
        </>
      }
    >
      {plan.length > 1 && (
        <section className="cx__sec">
          <h3>นัดตามคอร์ส · {p.course!.name}</h3>
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
                <b>ทั้งคอร์ส ({plan.length} นัด)</b>
                <small>ทุกนัดที่ยังไม่มา</small>
              </span>
            </button>
          </div>
          <p className="cx__hint">หรือแตะเลือกทีละวัน · เลือก {targets.length}/{plan.length} นัด</p>
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
        <h3>ผู้ยกเลิก</h3>
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
              {x === "patient" ? "ผู้ป่วยยกเลิก" : "คลินิกยกเลิก"}
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
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น จะโทรกลับมานัดใหม่" />
        </Field>
      </section>

      <div className="cx__info">
        <p>
          <Info size={15} /> เวลาและเตียงนี้ว่างให้คนอื่นจองทันที
        </p>
        {p.course && (
          <p>
            <Ticket size={15} /> คืนเครดิตคอร์ส {targets.length} ครั้ง
          </p>
        )}
        {paid.length > 0 && <p className="is-warn">ชำระแล้ว {paid.length} นัด · ยกเลิกใบเสร็จและบันทึกคืนเงินให้</p>}
      </div>

      <div className={clsx("cx__notify", notify && "is-on")}>
        <span>
          <b>แจ้งผู้ป่วยในแอป ThaiWell</b>
          <small>ส่งแจ้งยกเลิกพร้อมเหตุผล</small>
        </span>
        <Switch checked={notify} onChange={setNotify} label="แจ้งผู้ป่วย" />
      </div>
    </Dialog>
  );
}
