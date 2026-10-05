import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CalendarClock, CalendarX2, ClipboardList, History, MessageSquareText, Phone, Play, ReceiptText, ShieldAlert, ShieldCheck, Stethoscope, Ticket, Undo2, UserRound } from "lucide-react";
import { clsx } from "clsx";
import { useStore } from "../../store/store";
import { Avatar, Button, Dialog, EmptyState, Field, Input, Select, useToast } from "../../design-system";
import { WorkPage } from "../../layout/WorkPage";
import { BackLead } from "../../layout/BackLead";
import { CancelDialog } from "../../features/CancelDialog";
import { ReceiptDialog } from "../../features/Receipt";
import { slotLoad } from "../../features/slotLoad";
import { bedName, creditInfo, stageMeta, staffState } from "../../data/domain";
import { screeningFlags } from "../../data/counterScreening";
import { patientPhoto, therapistPhoto } from "../../data/avatars";
import { baht, fromMinutes, thaiDateLong, thaiDateShort, todayISO, toMinutes } from "../../data/thaiDate";
import type { Appointment } from "../../data/types";
import "./appointment-detail.css";

const clock = (iso: string) => new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });

/** /appointments/:id — everything about one appointment, with reschedule / cancel / go-to-visit actions */
export default function AppointmentDetail() {
  const { id } = useParams();
  const store = useStore();
  const navigate = useNavigate();
  const [cancelling, setCancelling] = useState(false);
  const [moving, setMoving] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);
  const a = store.appointments.find((x) => x.id === id);
  const back = () => (window.history.length > 1 ? navigate(-1) : navigate("/appointments"));

  if (!a)
    return (
      <WorkPage eyebrow="ตารางนัด" title="รายละเอียดนัด" bell={false} lead={<BackLead eyebrow="ตารางนัด" title="รายละเอียดนัด" onBack={back} />}>
        <div className="sheet ad__none">
          <EmptyState icon={<ClipboardList size={24} />} title="ไม่พบนัดนี้" description="นัดอาจถูกลบไปแล้ว" />
        </div>
      </WorkPage>
    );

  const p = store.patientById(a.patientId);
  const s = store.serviceById(a.serviceId);
  const t = store.therapistById(a.therapistId);
  const meta = stageMeta(a);
  const credits = creditInfo(p, store.appointments);
  // can still be moved / cancelled until the massage starts (even after the queue was called)
  const notStarted = a.status === "waiting";
  const d = new Date(a.date + "T00:00:00");
  const flags = p.screening ? screeningFlags(p.screening, store.settings.bpThreshold) : [];
  const stop = flags.some((f) => f.level === "stop");

  // booked sessions of the current treatment plan: each upcoming appointment holds one course credit (see creditInfo)
  const plan = p.course
    ? store.appointments
        .filter((x) => x.patientId === p.id && (x.status === "waiting" || x.status === "active") && x.date >= todayISO())
        .sort((x, y) => (x.date + x.start).localeCompare(y.date + y.start))
    : [];
  const idx = plan.findIndex((x) => x.id === a.id);
  const sessionNo = idx >= 0 && p.course ? p.course.used + idx + 1 : 0;

  return (
    <WorkPage eyebrow="ตารางนัด" title="รายละเอียดนัด" bell={false} lead={<BackLead eyebrow={`ตารางนัด · ${p.name}`} title="รายละเอียดนัด" onBack={back} />}>
      <div className="ad scroll-y scroll-y--light">
        {/* hero */}
        <section className={clsx("ad__hero", a.status === "cancelled" && "is-cancelled")} style={{ ["--sc" as string]: meta.color }}>
          <div className="ad__date">
            <small>{d.toLocaleDateString("th-TH", { weekday: "short" })}</small>
            <b>{d.getDate()}</b>
            <small>{d.toLocaleDateString("th-TH", { month: "short", year: "2-digit" })}</small>
          </div>
          <div className="ad__when">
            <span className="ad__status">
              <i /> {meta.label}
            </span>
            <h2>
              {a.start}–{fromMinutes(toMinutes(a.start) + s.minutes)} น.
            </h2>
            <p>
              {thaiDateLong(a.date)} · {s.name} · {s.minutes} นาที
            </p>
          </div>
          <div className="ad__actions">
            {notStarted && (
              <>
                <Button variant="outline" size="md" leading={<CalendarClock size={16} />} onClick={() => setMoving(true)}>
                  เลื่อนนัด
                </Button>
                <Button variant="outline" size="md" className="ad__danger" leading={<CalendarX2 size={16} />} onClick={() => setCancelling(true)}>
                  ยกเลิกนัด
                </Button>
              </>
            )}
            {a.status === "cancelled" && (
              <Button
                variant="outline"
                size="md"
                leading={<Undo2 size={16} />}
                onClick={() => store.dispatch({ type: "updateAppointment", id: a.id, patch: { status: "waiting", calledAt: undefined, cancel: undefined }, log: "เลิกยกเลิกนัด" })}
              >
                เลิกยกเลิกนัด
              </Button>
            )}
            {a.payment && (
              <Button variant="outline" size="md" leading={<ReceiptText size={16} />} onClick={() => setReceipt(a.id)}>
                ใบเสร็จ
              </Button>
            )}
            {a.date === todayISO() && a.status !== "cancelled" && (
              <Button size="md" leading={<Play size={16} />} onClick={() => navigate(`/visits?id=${a.id}`)}>
                ไปหน้ารับบริการ
              </Button>
            )}
          </div>
        </section>

        {a.cancel && (
          <div className="ad__cancel">
            <CalendarX2 size={18} />
            <div>
              <b>ยกเลิกนัดแล้ว · {a.cancel.by === "patient" ? "ผู้ป่วยแจ้งยกเลิก" : "คลินิกยกเลิก"}</b>
              <small>
                {a.cancel.reason}
                {a.cancel.note ? ` · ${a.cancel.note}` : ""} · โดย {a.cancel.staff} · {thaiDateShort(a.cancel.at.slice(0, 10))} {clock(a.cancel.at)} น.
              </small>
            </div>
          </div>
        )}

        <div className="ad__grid">
          <div className="ad__col">
            {/* patient */}
            <section className="ad__card ad__patient">
              <Avatar name={p.name} src={patientPhoto(p)} size="lg" shape="squircle" />
              <div>
                <b>{p.name}</b>
                <small>
                  {p.hn} · {p.gender} {p.age} ปี
                </small>
              </div>
              {p.phone && (
                <a className="ad__icon" href={`tel:${p.phone}`} aria-label={`โทร ${p.phone}`}>
                  <Phone size={16} />
                </a>
              )}
              <button type="button" className="ad__link" onClick={() => navigate(`/patients?id=${p.id}`)}>
                <UserRound size={14} /> ประวัติผู้ป่วย
              </button>
            </section>

            {/* details */}
            <section className="ad__card">
              <h3>รายละเอียดนัด</h3>
              <dl className="ad__kv">
                <div>
                  <dt>บริการ</dt>
                  <dd>
                    {s.name} · {s.minutes} นาที
                  </dd>
                </div>
                <div>
                  <dt>ผู้บำบัด</dt>
                  <dd className="ad__staff">
                    <Avatar name={t.name} src={therapistPhoto(t)} size="xs" color={t.color} />
                    {t.name}
                  </dd>
                </div>
                <div>
                  <dt>เตียง</dt>
                  <dd>{a.bedId ? bedName(store.settings, a.bedId) : "เลือกตอนเริ่มรับบริการ"}</dd>
                </div>
                <div>
                  <dt>ประเภท</dt>
                  <dd>{a.type === "walkin" ? "Walk-in" : "นัดล่วงหน้า"}</dd>
                </div>
                <div>
                  <dt>ค่าบริการ</dt>
                  <dd>
                    {a.payment ? `${baht(a.payment.amount)} บาท · ${a.payment.method === "credit" ? "หักเครดิตคอร์ส" : "ชำระแล้ว"}` : credits ? "หักเครดิตคอร์สเมื่อรับบริการ" : `${baht(s.price)} บาท`}
                  </dd>
                </div>
                <div>
                  <dt>Pain ก่อนนวด</dt>
                  <dd>
                    {a.painBefore}/10
                    {a.painAfter != null ? ` → หลังนวด ${a.painAfter}/10` : ""}
                  </dd>
                </div>
              </dl>
              {a.note && (
                <blockquote className="ad__note">
                  <MessageSquareText size={14} /> {a.note}
                </blockquote>
              )}
            </section>

            {/* plan */}
            {p.course && sessionNo > 0 && (
              <section className="ad__card">
                <h3>
                  <Ticket size={15} /> แผนการรักษา · ครั้งที่ {sessionNo} จาก {p.course.total}
                </h3>
                <p className="ad__muted">{p.course.name} · นัดที่จองไว้ในแผน</p>
                <ol className="ad__plan">
                  {plan.map((x, i) => {
                    const m = stageMeta(x);
                    return (
                      <li key={x.id} className={clsx(x.id === a.id && "is-this", x.status === "done" && "is-done")} style={{ ["--sc" as string]: m.color }}>
                        <button type="button" onClick={() => x.id !== a.id && navigate(`/appointments/${x.id}`, { replace: true })}>
                          <i>{p.course!.used + i + 1}</i>
                          <span>
                            {thaiDateShort(x.date)} · {x.start}
                          </span>
                          <em>{m.label}</em>
                        </button>
                      </li>
                    );
                  })}
                </ol>
                {credits && (
                  <p className="ad__muted">
                    ใช้แล้ว {credits.used} · จองไว้ {credits.booked} · ว่าง {credits.remaining}
                  </p>
                )}
              </section>
            )}

            {/* treatment record */}
            {(a.diagnoses?.length || a.procedures?.length || a.advice) && (
              <section className="ad__card">
                <h3>
                  <Stethoscope size={15} /> บันทึกการรักษา
                </h3>
                {a.diagnoses?.length ? (
                  <div className="ad__chips">
                    <small>วินิจฉัย</small>
                    {a.diagnoses.map((x) => (
                      <span key={x.name}>
                        {x.name}
                        {x.code && <em>{x.code}</em>}
                      </span>
                    ))}
                  </div>
                ) : null}
                {a.procedures?.length ? (
                  <div className="ad__chips">
                    <small>หัตถการ</small>
                    {a.procedures.map((x) => (
                      <span key={x.name + (x.area ?? "")}>
                        {x.name}
                        {x.area ? ` · ${x.area}` : ""}
                        {x.code && <em>{x.code}</em>}
                      </span>
                    ))}
                  </div>
                ) : null}
                {a.advice && <p className="ad__advice">{a.advice}</p>}
              </section>
            )}
          </div>

          <div className="ad__col">
            {/* screening */}
            <section className={clsx("ad__card ad__scr", !p.screening ? "is-none" : stop ? "is-stop" : flags.length ? "is-warn" : "is-ok")}>
              <h3>
                {stop || flags.length ? <ShieldAlert size={15} /> : <ShieldCheck size={15} />} ผลคัดกรองล่าสุด
              </h3>
              {p.screening ? (
                <>
                  <b>{stop ? "พบข้อห้าม · ต้องให้แพทย์ประเมินก่อนนวด" : flags.length ? `ข้อควรระวัง ${flags.length} ข้อ` : "ผ่านการคัดกรอง"}</b>
                  <small>
                    {thaiDateShort(p.screening.at.slice(0, 10))}
                    {p.screening.bpSys ? ` · ความดัน ${p.screening.bpSys}/${p.screening.bpDia ?? "—"}` : ""}
                    {p.screening.pain != null ? ` · ปวด ${p.screening.pain}/10` : ""}
                  </small>
                  {flags.length > 0 && <small>{flags.map((f) => f.label).join(" · ")}</small>}
                </>
              ) : (
                <small>ยังไม่ได้คัดกรอง · คัดกรองได้ตอนผู้ป่วยมารับบริการ</small>
              )}
              {a.date === todayISO() && notStarted && (
                <button type="button" className="ad__link" onClick={() => navigate(`/patients/${p.id}/screen`)}>
                  คัดกรองก่อนนวด
                </button>
              )}
            </section>

            {/* timeline */}
            <section className="ad__card">
              <h3>
                <History size={15} /> ประวัติของนัดนี้
              </h3>
              {a.log?.length ? (
                <ol className="ad__log">
                  {[...a.log].reverse().map((l, i) => (
                    <li key={i}>
                      <time>
                        {thaiDateShort(l.at.slice(0, 10))} {clock(l.at)}
                      </time>
                      <span>{l.label}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="ad__muted">ยังไม่มีความเคลื่อนไหว</p>
              )}
            </section>
          </div>
        </div>
      </div>

      <CancelDialog appt={cancelling ? a : null} onClose={() => setCancelling(false)} />
      <RescheduleDialog appt={moving ? a : null} onClose={() => setMoving(false)} />
      <ReceiptDialog id={receipt} onClose={() => setReceipt(null)} />
    </WorkPage>
  );
}

/** move an appointment to another day / time / therapist */
function RescheduleDialog({ appt, onClose }: { appt: Appointment | null; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const [date, setDate] = useState(appt?.date ?? todayISO());
  const [time, setTime] = useState(appt?.start ?? "");
  const [tid, setTid] = useState(appt?.therapistId ?? "");
  const key = appt?.id;
  useEffect(() => {
    if (!appt) return;
    setDate(appt.date);
    setTime(appt.start);
    setTid(appt.therapistId);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const others = useMemo(() => store.appointments.filter((x) => x.id !== appt?.id), [store.appointments, appt?.id]);
  if (!appt) return null;
  const p = store.patientById(appt.patientId);
  const slots = slotLoad(others, date, store.settings);
  const t = store.therapistById(tid);
  const st = time ? staffState(t, { date, start: time, serviceId: appt.serviceId }, others) : "free";
  const same = date === appt.date && time === appt.start && tid === appt.therapistId;

  const save = () => {
    store.dispatch({ type: "updateAppointment", id: appt.id, patch: { date, start: time, therapistId: tid }, log: `เลื่อนนัด ${thaiDateShort(appt.date)} ${appt.start} → ${thaiDateShort(date)} ${time} น.` });
    toast({ message: `เลื่อนนัด ${p.name} เป็น ${thaiDateShort(date)} ${time} น. แล้ว` });
    onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      className="cx"
      title="เลื่อนนัด"
      subtitle={`${p.name} · เดิม ${thaiDateShort(appt.date)} ${appt.start} น.`}
      footer={
        <>
          <Button variant="outline" size="md" onClick={onClose}>
            กลับ
          </Button>
          <Button size="md" disabled={!time || same} leading={<CalendarClock size={16} />} onClick={save}>
            ยืนยันเลื่อนนัด
          </Button>
        </>
      }
    >
      <Field label="วันที่">
        <Input type="date" min={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <div className="ad__slots">
        <small>เวลา · ตัวเลขคือเตียงว่าง</small>
        <div>
          {slots.map((x) => (
            <button key={x.time} type="button" disabled={x.free === 0 && x.time !== appt.start} aria-pressed={time === x.time} onClick={() => setTime(x.time)}>
              <b>{x.time}</b>
              <small>{x.free > 0 ? `ว่าง ${x.free}` : "เต็ม"}</small>
            </button>
          ))}
        </div>
      </div>
      <Field label="ผู้บำบัด">
        <Select value={tid} onChange={(e) => setTid(e.target.value)}>
          {store.therapists.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </Select>
      </Field>
      {time && st !== "free" && <p className="ad__warn">{st === "busy" ? "ผู้บำบัดติดคิวเวลานี้" : st === "service" ? "ผู้บำบัดไม่รับบริการนี้" : "ผู้บำบัดไม่เข้าเวรวันนี้"} · เลือกเวลาหรือผู้บำบัดอื่น</p>}
    </Dialog>
  );
}
