import { useEffect, useMemo, useState } from "react";
import { CalendarCheck2, CalendarDays, CircleAlert, MessageSquareText, Phone } from "lucide-react";
import type { BookingRequest } from "../data/types";
import { useStore } from "../store/store";
import { Avatar, Button, Chip, Dialog, Field, Input, Textarea, useToast } from "../design-system";
import { creditInfo, evaluateScreening, sameDayAppt, shiftsOn, staffState } from "../data/domain";
import { thaiDate, thaiDateLong, timeAgo, todayISO } from "../data/thaiDate";
import { CreditPips } from "./widgets";
import { slotLoad } from "./slotLoad";
import { patientPhoto, therapistPhoto } from "../data/avatars";
import { clsx } from "clsx";
import { useLatest } from "./useLatest";
import { IntakeCard } from "./IntakeCard";
import { AppGuideCard } from "./AppGuideCard";
import { intakeOfRequest } from "../data/intake";
import "./approve-dialog.css";
import { elementProfile } from "../data/elements";

export function ApproveDialog({ request: incoming, onClose }: { request: BookingRequest | null; onClose: () => void }) {
  const request = useLatest(incoming);
  const store = useStore();
  const toast = useToast();
  const [date, setDate] = useState("");
  const [start, setStart] = useState("");
  const [therapistId, setTherapistId] = useState("");

  useEffect(() => {
    if (incoming) {
      setDate(incoming.date);
      setStart(incoming.start);
      setTherapistId(incoming.therapistId);
    }
  }, [incoming]);

  const slots = useMemo(() => (date ? slotLoad(store.appointments, date, store.settings) : []), [store.appointments, store.settings, date]);
  if (!request) return null;

  const p = store.patientById(request.patientId);
  const s = store.serviceById(request.serviceId);
  const flags = evaluateScreening(request.screening, store.settings);
  const intake = intakeOfRequest(request, p);
  const credits = creditInfo(p, store.appointments);
  const noCredit = credits !== null && credits.remaining === 0;
  const chosen = slots.find((x) => x.time === start);
  const therapist = therapistId ? store.therapists.find((t) => t.id === therapistId) : undefined;
  // ผู้บำบัดแต่ละคนวันนั้น: เวลาเข้างาน · รอบที่ว่าง (เตียงว่าง + ไม่มีนัด + ทำบริการนี้)
  const staff = store.therapists.map((t) => {
    const blocks = date ? shiftsOn(t, date) : [];
    const states = slots.map((sl) => (sl.free > 0 ? staffState(t, { date, start: sl.time, serviceId: request.serviceId }, store.appointments) : "busy"));
    const free = states.filter((x) => x === "free").length;
    const can = blocks.length > 0 && states.some((x) => x !== "service" && x !== "off");
    // ช่วงเข้างานวันนั้น (เริ่มแรกสุด–เลิกช้าสุด)
    const span = blocks.length ? `${blocks.map((b) => b.split("–")[0]).sort()[0]}–${blocks.map((b) => b.split("–")[1]).sort().slice(-1)[0]}` : "";
    return { t, shift: span || "ไม่เข้างาน", free, can };
  });
  const therapistFree = !!therapist && !!start && staffState(therapist, { date, start, serviceId: request.serviceId }, store.appointments) === "free";
  // 1 คน 1 นัดต่อวัน
  const sameDay = sameDayAppt(store.appointments, p.id, date, request.courseVisitId);
  const canApprove = Boolean(date && start && chosen && chosen.free > 0 && !sameDay && therapistFree);

  const approve = () => {
    store.dispatch({ type: "approve", id: request.id, patch: { date, start, therapistId, serviceId: request.serviceId } });
    toast({ message: `อนุมัตินัด ${p.name} · ${thaiDate(date)} ${start} น.` });
    onClose();
  };

  return (
    <Dialog
      open={incoming !== null}
      wide
      className="apv"
      onClose={onClose}
      leading={<Avatar name={p.name} src={patientPhoto(p)} size="card" shape="squircle" />}
      title={p.name}
      subtitle={`${p.hn} · ขอเมื่อ ${timeAgo(request.submittedAt)}`}
      footer={
        <>
          <Button variant="outline" size="lg" fill onClick={onClose}>
            ปิด
          </Button>
          <Button variant="primary" size="lg" fill disabled={!canApprove} onClick={approve} leading={<CalendarCheck2 size={16} />}>
            อนุมัติ
          </Button>
        </>
      }
    >
      {/* ซ้าย: อ่านข้อมูลประกอบ · ขวา: เลือกวันเวลาแล้วอนุมัติ */}
      <div className="apv__read scroll-y scroll-y--light">
        {/* คำขอ: วันเวลา · บริการ · ผู้บำบัด · หมายเหตุ */}
        <section className="apv__req">
          <CalendarDays className="apv__req-bg" size={132} strokeWidth={1.4} aria-hidden />
          {/* ติดต่อผู้ป่วย (โทรตกลงเวลาใหม่ / ถามอาการเพิ่ม) */}
          {p.phone ? (
            <a className="apv__call" href={`tel:${p.phone.replace(/[^0-9+]/g, "")}`} aria-label={`โทร ${p.phone}`}>
              <Phone size={15} />
              <span>{p.phone}</span>
            </a>
          ) : (
            <span className="apv__call is-none">ไม่มีเบอร์โทร</span>
          )}
          <small>ขอนัด</small>
          <b>
            {thaiDate(request.date)} · {request.start} น.
          </b>
          <span>
            {s.name} {s.minutes} นาที · {store.therapistById(request.therapistId).name || "ไม่ระบุผู้บำบัด"}
          </span>
          {request.note && !/^AI ประเมิน/.test(request.note) && (
            <p className="apv__note">
              <MessageSquareText size={14} />
              {request.note}
            </p>
          )}
        </section>

        {/* ผลประเมินก่อนนวด: คัดกรอง + อาการ + ตำแหน่งที่ปวด (การประเมินครั้งเดียวกัน) */}
        <section className="apv__sec">
          <h3>
            ผลประเมินก่อนนวด <small>{timeAgo(intake.at)}</small>
          </h3>
          <IntakeCard intake={intake} sex={p.gender} element={elementProfile(p).birth} compact head={false} screening={request.screening} screeningFlags={flags} />
        </section>

        {(request.appGuide || !!(request.intake?.focusAreas ?? []).length) && !flags.some((f) => f.level === "stop") && (
          <AppGuideCard guide={request.appGuide} areas={request.intake?.focusAreas} compact />
        )}
      </div>

      <div className="apv__act scroll-y scroll-y--light">
        {sameDay && (
          <div className="alert alert--stop">
            <CircleAlert size={16} />
            <div>
              <b>มีนัดวันนี้แล้ว {sameDay.start} น.</b>
              1 คนจองได้วันละ 1 นัด · เลือกวันอื่น หรือปฏิเสธคำขอนี้
            </div>
          </div>
        )}
        <section className="apv__sec">
          <h3>คอร์ส</h3>
          {credits ? (
            <>
              <CreditPips info={credits} adding={noCredit ? 0 : 1} name={p.course!.name} />
              {noCredit && (
                <div className="alert alert--stop">
                  <CircleAlert size={16} />
                  <div>
                    <b>เครดิตคอร์สหมดแล้ว</b>
                    ให้แพทย์เปิดคอร์สใหม่ หรือชำระรายครั้ง
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="apv__none">ไม่มีคอร์ส · ชำระรายครั้ง</p>
          )}
        </section>
        <section className="apv__sec">
          <h3>วันที่</h3>
          <Field label="" hint={date ? thaiDateLong(date) : undefined}>
            <Input type="date" value={date} min={todayISO()} onChange={(e) => setDate(e.target.value)} aria-label="วันที่" />
          </Field>
        </section>

        {/* ผู้บำบัด: แสดงทุกคน พร้อมเวลาเข้างานและจำนวนรอบที่ว่างของวันนั้น */}
        <section className="apv__sec">
          <h3>
            ผู้บำบัด <small>{s.name}</small>
          </h3>
          <ul className="apv__staff">
            {staff.map(({ t, shift, free, can }) => (
              <li key={t.id}>
                <button type="button" className={clsx("apv__person", therapistId === t.id && "is-on", !can && "is-off")} aria-pressed={therapistId === t.id} disabled={!can} onClick={() => setTherapistId(t.id)}>
                  <Avatar name={t.name} src={therapistPhoto(t)} size="sm" color={t.color} />
                  <span className="apv__pname">
                    <b>{t.name}</b>
                    <small>
                      {shift !== "ไม่เข้างาน" && <span>{shift} · </span>}
                      <em className={clsx(can && free ? "is-free" : "is-none")}>{!can ? (shift === "ไม่เข้างาน" ? "หยุดวันนี้" : "ไม่ทำบริการนี้") : free ? `ว่าง ${free} รอบ` : "เต็ม"}</em>
                    </small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* เวลา: ของผู้บำบัดที่เลือก */}
        <section className="apv__sec">
          <h3>
            เวลา <small>{therapist ? therapist.name : "เลือกผู้บำบัดก่อน"}</small>
          </h3>
          <div className="slots apv__slots">
            {slots.map((sl) => {
              const st = therapist ? staffState(therapist, { date, start: sl.time, serviceId: request.serviceId }, store.appointments) : "free";
              const ok = st === "free" && sl.free > 0;
              const why = st === "busy" ? "มีนัด" : st === "off" ? "นอกเวลา" : st === "service" ? "ไม่ทำบริการ" : sl.free === 0 ? "เตียงเต็ม" : `ว่าง ${sl.free} เตียง`;
              return (
                <button key={sl.time} type="button" className={clsx("slot", !ok && "is-na")} aria-pressed={start === sl.time} disabled={!ok} onClick={() => setStart(sl.time)}>
                  <span className="slot__time">{sl.time}</span>
                  <span className="slot__cap">{why}</span>
                </button>
              );
            })}
          </div>
        </section>
        {date && start && therapist && !therapistFree && (
          <div className="alert alert--caution">
            <CircleAlert size={16} />
            <div>
              <b>{start} น. ไม่ว่างกับ{therapist.name}</b>
              เลือกเวลาอื่น หรือผู้บำบัดคนอื่นที่ว่าง
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

const REASONS = ["คิวเต็มช่วงเวลาที่ขอ", "ผลคัดกรองไม่ผ่าน ต้องพบแพทย์ก่อน", "เครดิตคงเหลือไม่พอ", "ผู้ป่วยขอยกเลิก"];

export function RejectDialog({ request: incoming, onClose }: { request: BookingRequest | null; onClose: () => void }) {
  const request = useLatest(incoming);
  const store = useStore();
  const toast = useToast();
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (incoming) {
      setReason(REASONS[0]);
      setNote("");
    }
  }, [incoming]);

  if (!request) return null;
  const p = store.patientById(request.patientId);

  const reject = () => {
    store.dispatch({ type: "reject", id: request.id, reason, note: note.trim() || undefined });
    toast({
      message: `ปฏิเสธคำขอของ ${p.name} แล้ว`,
      tone: "danger",
      action: { label: "เลิกทำ", onClick: () => store.dispatch({ type: "restoreRequest", request }) },
    });
    onClose();
  };

  return (
    <Dialog
      open={incoming !== null}
      onClose={onClose}
      leading={<Avatar name={p.name} src={patientPhoto(p)} size="card" shape="squircle" />}
      title="ปฏิเสธคำขอจอง"
      subtitle={`${p.name} · ${thaiDate(request.date)} ${request.start} น.`}
      footer={
        <>
          <Button variant="outline" size="lg" fill onClick={onClose}>
            ปิด
          </Button>
          <Button variant="danger" size="lg" fill onClick={reject}>
            ยืนยันการปฏิเสธ
          </Button>
        </>
      }
    >
      <section className="sec">
        <h3 className="sec__title">เหตุผล (แจ้งผู้ป่วยในแอป)</h3>
        <div className="reasons">
          {REASONS.map((r) => (
            <Chip key={r} pressed={reason === r} onClick={() => setReason(r)}>
              {r}
            </Chip>
          ))}
        </div>
        <Field label="หมายเหตุ (ไม่บังคับ)">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น แนะนำเวลาอื่นที่ว่าง" />
        </Field>
      </section>
    </Dialog>
  );
}
