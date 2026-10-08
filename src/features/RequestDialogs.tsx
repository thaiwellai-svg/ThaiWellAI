import { useEffect, useMemo, useState } from "react";
import { CalendarCheck2, CircleAlert } from "lucide-react";
import type { BookingRequest } from "../data/types";
import { useStore } from "../store/store";
import { Avatar, Button, Chip, Dialog, Field, Input, Select, Textarea, useToast } from "../design-system";
import { creditInfo, evaluateScreening } from "../data/domain";
import { thaiDate, thaiDateLong, timeAgo, todayISO } from "../data/thaiDate";
import { CreditPips, ScreeningAlert, ScreeningGrid } from "./widgets";
import { slotLoad } from "./slotLoad";
import { patientPhoto } from "../data/avatars";
import { useLatest } from "./useLatest";
import { IntakeCard } from "./IntakeCard";
import { AppGuideCard } from "./AppGuideCard";
import { intakeOfRequest } from "../data/intake";
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
  const credits = creditInfo(p, store.appointments);
  const noCredit = credits !== null && credits.remaining === 0;
  const chosen = slots.find((x) => x.time === start);
  const canApprove = Boolean(date && start && chosen && chosen.free > 0);

  const approve = () => {
    store.dispatch({ type: "approve", id: request.id, patch: { date, start, therapistId, serviceId: request.serviceId } });
    toast({ message: `อนุมัตินัด ${p.name} · ${thaiDate(date)} ${start} น.` });
    onClose();
  };

  return (
    <Dialog
      open={incoming !== null}
      wide
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
            อนุมัติและจัดคิว
          </Button>
        </>
      }
    >
      {request.note && (
        <div className="alert alert--info">
          <CircleAlert size={16} />
          <div>
            <b>หมายเหตุจากผู้ป่วย</b>
            {request.note}
          </div>
        </div>
      )}
      <section className="sec">
        <div className="sec__head">
          <h3 className="sec__title">แบบคัดกรองจากแอป</h3>
          <span className="tw-caption">ตรวจตามเกณฑ์คลินิก</span>
        </div>
        <ScreeningGrid screening={request.screening} flags={flags} />
        <ScreeningAlert flags={flags} />
      </section>

      <section className="sec">
        <div className="sec__head">
          <h3 className="sec__title">เครดิตคอร์ส</h3>
        </div>
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
          <div className="alert alert--info">
            <CircleAlert size={16} />
            <div>
              <b>ไม่มีคอร์ส</b>
              ชำระเงินรายครั้ง
            </div>
          </div>
        )}
      </section>

      <section className="sec">
        <div className="sec__head">
          <h3 className="sec__title">วันและเวลา · {s.name} {s.minutes} นาที</h3>
          <span className="tw-caption">มี {store.settings.bedsPerSlot} เตียงต่อรอบ</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
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
        <div className="slots">
          {slots.map((sl) => (
            <button key={sl.time} type="button" className="slot" aria-pressed={start === sl.time} disabled={sl.free === 0} onClick={() => setStart(sl.time)}>
              <span className="slot__time">{sl.time}</span>
              <span className="slot__cap">{sl.free === 0 ? "เต็ม" : `ว่าง ${sl.free} เตียง`}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ข้อมูลอ้างอิงจากแอป (อาการ/แผน) ไว้ท้าย — งานหลักคือคัดกรอง → เครดิต → เลือกเวลา */}
      <section className="sec">
        <div className="sec__head">
          <h3 className="sec__title">อาการจากแอป</h3>
        </div>
        {/* อาการสำคัญ ระดับความปวด บริเวณที่ปวด (heatmap) และบริเวณห้ามนวด — แสดงในแบบประเมินจากแอปที่เดียว */}
        <IntakeCard intake={intakeOfRequest(request, p)} sex={p.gender} element={elementProfile(p).birth} compact />
      </section>
      {(request.appGuide || !!(request.intake?.focusAreas ?? []).length) && !flags.some((f) => f.level === "stop") && (
        <section className="sec">
          <div className="sec__head">
            <h3 className="sec__title">แผนการรักษาจากแอป</h3>
          </div>
          <AppGuideCard guide={request.appGuide} areas={request.intake?.focusAreas} compact />
        </section>
      )}
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
