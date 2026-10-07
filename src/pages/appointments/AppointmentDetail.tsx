import { useEffect, useMemo, useState } from "react";
import { extraTotal, visitTotal } from "../../features/billing";
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
import { bedName, creditInfo, evaluateScreening, stageMeta, staffState } from "../../data/domain";
import { VisitScreening } from "../../features/ScreeningAlert";
import { screeningFlags } from "../../data/counterScreening";
import { patientPhoto, therapistPhoto } from "../../data/avatars";
import { baht, fromMinutes, thaiDateShort, todayISO, toMinutes } from "../../data/thaiDate";
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
  const toast = useToast();
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
  // คัดกรองที่คลินิก (ล่าสุด) · ถ้ายังไม่เคย ใช้แบบคัดกรองตนเองจากแอปของนัดนี้
  const appFlags = !p.screening && a.screening ? evaluateScreening(a.screening, store.settings) : null;
  const flags = p.screening ? screeningFlags(p.screening, store.settings.bpThreshold) : (appFlags ?? []);
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
      <div className="adp">
        {/* top bar: status + actions (like the other sub-pages) */}
        <div className="adp__bar">
          <span className="adp__status" style={{ ["--sc" as string]: meta.color }}>
            <i /> {meta.label}
          </span>
          {sessionNo > 0 && p.course && (
            <span className="adp__tag">
              <Ticket size={13} /> ครั้งที่ {sessionNo}/{p.course.total}
            </span>
          )}
          <span className="adp__tag">{a.type === "walkin" ? "Walk-in" : "นัดล่วงหน้า"}</span>
          <div className="adp__actions">
            {a.payment && (
              <Button variant="outline" size="md" leading={<ReceiptText size={16} />} onClick={() => setReceipt(a.id)}>
                ใบเสร็จ
              </Button>
            )}
            {notStarted && (
              <>
                <Button variant="outline" size="md" leading={<CalendarX2 size={16} />} onClick={() => setCancelling(true)}>
                  ยกเลิกนัด
                </Button>
                <Button variant="outline" size="md" leading={<CalendarClock size={16} />} onClick={() => setMoving(true)}>
                  เลื่อนนัด
                </Button>
              </>
            )}
            {a.status === "cancelled" && (
              <Button
                variant="outline"
                size="md"
                leading={<Undo2 size={16} />}
                onClick={() => {
                  // เหมือนปุ่ม "ย้อนกลับ" ในหน้ารับบริการ: บันทึกในประวัติ + เลิกทำได้จาก toast
                  const prev = a;
                  store.dispatch({ type: "updateAppointment", id: a.id, patch: { status: "waiting", calledAt: undefined, cancel: undefined }, log: "เลิกยกเลิกนัด" });
                  toast({ message: `${p.name} กลับเป็นรอรับบริการแล้ว`, action: { label: "เลิกทำ", onClick: () => store.dispatch({ type: "restoreAppointment", appointment: prev }) } });
                }}
              >
                ย้อนกลับ
              </Button>
            )}
            {a.date === todayISO() && a.status !== "cancelled" && (
              <Button size="md" leading={<Play size={16} />} onClick={() => navigate(`/visits?id=${a.id}`)}>
                ไปหน้ารับบริการ
              </Button>
            )}
          </div>
        </div>

        <div className="adp__body scroll-y scroll-y--light">
          {/* hero: when + who */}
          <section className={clsx("adp__hero", a.status === "cancelled" && "is-cancelled")} style={{ ["--sc" as string]: meta.color }}>
            <div className="adp__date">
              <small>{d.toLocaleDateString("th-TH", { weekday: "long" })}</small>
              <b>{d.getDate()}</b>
              <small>{d.toLocaleDateString("th-TH", { month: "long", year: "numeric" })}</small>
            </div>
            <div className="adp__when">
              <small>เวลานัด</small>
              <h2>
                {a.start}–{fromMinutes(toMinutes(a.start) + s.minutes)} น.
              </h2>
              <p>
                {s.name} · {s.minutes} นาที
              </p>
            </div>
            <div className="adp__who">
              <Avatar name={p.name} src={patientPhoto(p)} size="lg" shape="squircle" />
              <div>
                <b>{p.name}</b>
                <small>
                  {p.hn} · {p.gender} {p.age} ปี
                </small>
                <span>
                  {p.phone && (
                    <a href={`tel:${p.phone}`}>
                      <Phone size={13} /> {p.phone}
                    </a>
                  )}
                  <button type="button" onClick={() => navigate(`/patients?id=${p.id}`)}>
                    <UserRound size={13} /> ประวัติผู้ป่วย
                  </button>
                </span>
              </div>
            </div>
          </section>

          {a.cancel && (
            <div className="adp__cancel">
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

          <div className="adp__grid">
            <div className="adp__col">
              <section className="adp__card">
                <header>
                  <ClipboardList size={15} /> รายละเอียดนัด
                </header>
                <div className="adp__facts">
                  <div>
                    <small>ผู้บำบัด</small>
                    <b className="adp__staff">
                      <Avatar name={t.name} src={therapistPhoto(t)} size="xs" color={t.color} />
                      {t.name}
                    </b>
                  </div>
                  <div>
                    <small>เตียง</small>
                    <b>{a.bedId ? bedName(store.settings, a.bedId) : "เลือกตอนเริ่ม"}</b>
                  </div>
                  <div>
                    <small>ค่าบริการ</small>
                    <b>{a.payment ? `${baht(a.payment.amount)} บาท` : credits ? `หักเครดิตคอร์ส${extraTotal(a) ? ` + หัตถการเพิ่ม ${baht(extraTotal(a))} บาท` : ""}` : `${baht(visitTotal(s, a))} บาท`}</b>
                    {a.payment && <em>{a.payment.method === "credit" ? "หักเครดิตแล้ว" : "ชำระแล้ว"}</em>}
                  </div>
                  <div>
                    <small>Pain</small>
                    <b>
                      {a.painBefore}
                      {a.painAfter != null ? ` → ${a.painAfter}` : ""}
                      <u>/10</u>
                    </b>
                    <em>{a.painAfter != null ? "ก่อน → หลังนวด" : "ก่อนนวด"}</em>
                  </div>
                </div>
                {a.note && (
                  <blockquote className="adp__note">
                    <MessageSquareText size={14} /> {a.note}
                  </blockquote>
                )}
              </section>

              {p.course && sessionNo > 0 && (
                <section className="adp__card">
                  <header>
                    <Ticket size={15} /> แผนการรักษา
                    <em>
                      ครั้งที่ {sessionNo} จาก {p.course.total}
                    </em>
                  </header>
                  <p className="adp__muted">{p.course.name}</p>
                  <div className="adp__track">
                    {Array.from({ length: p.course.total }, (_, k) => {
                      const used = k < p.course!.used;
                      const booked = plan[k - p.course!.used];
                      return (
                        <button
                          key={k}
                          type="button"
                          className={clsx(used && "is-used", booked && "is-booked", booked?.id === a.id && "is-this")}
                          disabled={!booked || booked.id === a.id}
                          onClick={() => booked && navigate(`/appointments/${booked.id}`, { replace: true })}
                          title={booked ? `${thaiDateShort(booked.date)} ${booked.start}` : undefined}
                        >
                          <b>{k + 1}</b>
                          <small>{used ? "ใช้แล้ว" : booked ? thaiDateShort(booked.date) : "ว่าง"}</small>
                        </button>
                      );
                    })}
                  </div>
                  {credits && (
                    <p className="adp__muted">
                      ใช้แล้ว {credits.used} · จองไว้ {credits.booked} · ว่าง {credits.remaining}
                    </p>
                  )}
                </section>
              )}

              {(a.diagnoses?.length || a.procedures?.length || a.advice) && (
                <section className="adp__card">
                  <header>
                    <Stethoscope size={15} /> บันทึกการรักษา
                  </header>
                  {a.diagnoses?.length ? (
                    <div className="adp__chips">
                      <small>วินิจฉัย</small>
                      <span>
                        {a.diagnoses.map((x) => (
                          <em key={x.name}>
                            {x.name}
                            {x.code && <u>{x.code}</u>}
                          </em>
                        ))}
                      </span>
                    </div>
                  ) : null}
                  {a.procedures?.length ? (
                    <div className="adp__chips">
                      <small>หัตถการ</small>
                      <span>
                        {a.procedures.map((x) => (
                          <em key={x.name + (x.area ?? "")}>
                            {x.name}
                            {x.area ? ` · ${x.area}` : ""}
                            {x.code && <u>{x.code}</u>}
                          </em>
                        ))}
                      </span>
                    </div>
                  ) : null}
                  {a.advice && <p className="adp__advice">{a.advice}</p>}
                </section>
              )}
            </div>

            <div className="adp__col">
              {a.date === todayISO() && notStarted ? (
                // วันนัด: แถบคัดกรองเดียวกับหน้ารับบริการ (รวมแบบคัดกรองตนเองจากแอป)
                <VisitScreening p={p} app={a.screening} onScreen={() => navigate(`/patients/${p.id}/screen`)} />
              ) : (
                <section className={clsx("adp__scr", !p.screening && !appFlags ? "is-none" : stop ? "is-stop" : flags.length ? "is-warn" : "is-ok")}>
                  <span className="adp__scr-i">{stop || flags.length ? <ShieldAlert size={18} /> : <ShieldCheck size={18} />}</span>
                  <div>
                    <small>{p.screening || !appFlags ? "ผลคัดกรองล่าสุด" : "แบบคัดกรองจากแอป"}</small>
                    <b>{!p.screening && !appFlags ? "ยังไม่ได้คัดกรอง" : stop ? "พบข้อห้าม · ต้องให้แพทย์ประเมิน" : flags.length ? `ข้อควรระวัง ${flags.length} ข้อ` : "ผ่านการคัดกรอง"}</b>
                    <span>
                      {p.screening
                        ? `${thaiDateShort(p.screening.at.slice(0, 10))}${p.screening.bpSys ? ` · ความดัน ${p.screening.bpSys}/${p.screening.bpDia ?? "—"}` : ""}${p.screening.pain != null ? ` · ปวด ${p.screening.pain}/10` : ""}${flags.length ? ` · ${flags.map((f) => f.label).join(" · ")}` : ""}`
                        : appFlags
                          ? `ผู้ป่วยตอบตอนจอง${flags.length ? ` · ${flags.map((f) => f.label).join(" · ")}` : ""} · วัดความดัน ชีพจร ในวันนัด`
                          : "คัดกรองได้ตอนผู้ป่วยมารับบริการ"}
                    </span>
                  </div>
                </section>
              )}

              <section className="adp__card">
                <header>
                  <History size={15} /> ความเคลื่อนไหว
                </header>
                {a.log?.length ? (
                  <ol className="adp__log">
                    {[...a.log].reverse().map((l, i) => (
                      <li key={i}>
                        <span>{l.label}</span>
                        <time>
                          {thaiDateShort(l.at.slice(0, 10))} · {clock(l.at)} น.
                        </time>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="adp__muted">ยังไม่มีความเคลื่อนไหว</p>
                )}
              </section>
            </div>
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
