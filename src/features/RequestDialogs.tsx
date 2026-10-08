import { useEffect, useMemo, useState } from "react";
import { CalendarCheck2, CircleAlert, MessageSquareText } from "lucide-react";
import type { BookingRequest } from "../data/types";
import { useStore } from "../store/store";
import { Avatar, Button, Chip, Dialog, Field, Input, Select, Textarea, useToast } from "../design-system";
import { creditInfo, evaluateScreening, sameDayAppt } from "../data/domain";
import { thaiDate, thaiDateLong, timeAgo, todayISO } from "../data/thaiDate";
import { CreditPips } from "./widgets";
import { slotLoad } from "./slotLoad";
import { patientPhoto } from "../data/avatars";
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
  // 1 คน 1 นัดต่อวัน
  const sameDay = sameDayAppt(store.appointments, p.id, date, request.courseVisitId);
  const canApprove = Boolean(date && start && chosen && chosen.free > 0 && !sameDay);

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
          <h3>
            วันและเวลา <small>มี {store.settings.bedsPerSlot} เตียงต่อรอบ</small>
          </h3>
          <div className="apv__fields">
            <Field label="วันที่" hint={date ? thaiDateLong(date) : undefined}>
              <Input type="date" value={date} min={todayISO()} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="ผู้บำบัด">
              <Select value={therapistId} onChange={(e) => setTherapistId(e.target.value)}>
                {store.therapists.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="slots apv__slots">
            {slots.map((sl) => (
              <button key={sl.time} type="button" className="slot" aria-pressed={start === sl.time} disabled={sl.free === 0} onClick={() => setStart(sl.time)}>
                <span className="slot__time">{sl.time}</span>
                <span className="slot__cap">{sl.free === 0 ? "เต็ม" : `ว่าง ${sl.free}`}</span>
              </button>
            ))}
          </div>
        </section>
        {date && start && (
          <div className="apv__sum">
            <small>จะนัดเป็น</small>
            <b>
              {thaiDateLong(date)} · {start} น.
            </b>
            <span>
              {s.name} · {store.therapistById(therapistId).name}
            </span>
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
