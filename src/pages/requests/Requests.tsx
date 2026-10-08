import { AppGuideCard } from "../../features/AppGuideCard";
import { AssessHistory } from "../../features/AssessHistory";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, CalendarCheck2, CalendarRange, Check, CircleCheck, CircleX, History, ListFilter, MessageSquareText, Phone, ShieldAlert, ShieldCheck, Stethoscope, UserRound, X } from "lucide-react";
import { clsx } from "clsx";
import { useStore } from "../../store/store";
import { Avatar, Badge, Button, EmptyState, SearchField, Segmented, spring } from "../../design-system";
import { WorkPage } from "../../layout/WorkPage";
import { BackLead } from "../../layout/BackLead";
import { ApproveDialog, RejectDialog } from "../../features/RequestDialogs";
import { FilterMenu } from "../../features/FilterMenu";
import { creditInfo, evaluateScreening, requestConflicts, sameDayAppt, staffState } from "../../data/domain";
import { ELEMENT_INFO, elementProfile } from "../../data/elements";
import { patientPhoto, therapistPhoto } from "../../data/avatars";
import { fromMinutes, thaiDate, thaiDateLong, thaiDateShort, timeAgo, toMinutes } from "../../data/thaiDate";
import type { BookingRequest, RequestDecision } from "../../data/types";
import { IntakeCard } from "../../features/IntakeCard";
import { intakeOfRequest } from "../../data/intake";
import "../appointments/appointments.css";
import { DEMO } from "../../data/mode";
import "./requests.css";

type Tab = "pending" | "history";
type PendingFilter = "all" | "flagged" | "clash" | "clear";
type HistoryFilter = "all" | "approved" | "rejected";
const clock = (iso: string) => new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });

/** คำขอจอง — queue of booking requests from the ThaiWell AI app (list · detail), and the decision history. */
export default function Requests() {
  const store = useStore();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const tab = (params.get("tab") as Tab) ?? "pending";
  const [query, setQuery] = useState("");
  const [pf, setPf] = useState<PendingFilter>("all");
  const [hf, setHf] = useState<HistoryFilter>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [approving, setApproving] = useState<BookingRequest | null>(null);
  const [rejecting, setRejecting] = useState<BookingRequest | null>(null);

  const matches = (pid: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const p = store.patientById(pid);
    return `${p.name} ${p.hn} ${p.phone}`.toLowerCase().includes(q);
  };
  const flagsOf = (r: BookingRequest) => evaluateScreening(r.screening, store.settings);
  const clashOf = (r: BookingRequest) => requestConflicts(r, store.appointments, store.settings, store.therapists);

  const pending = useMemo(
    () =>
      [...store.requests]
        .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
        .filter((r) => matches(r.patientId))
        .filter((r) => pf === "all" || (pf === "flagged" ? flagsOf(r).length > 0 : pf === "clash" ? clashOf(r).length > 0 : flagsOf(r).length === 0 && clashOf(r).length === 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store.requests, store.appointments, store.settings, query, pf],
  );
  const history = useMemo(
    () =>
      [...store.decisions]
        .sort((a, b) => b.decidedAt.localeCompare(a.decidedAt))
        .filter((d) => matches(d.request.patientId) && (hf === "all" || d.outcome === hf)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store.decisions, query, hf],
  );

  // keep a selection that exists in the current list
  const ids = tab === "pending" ? pending.map((r) => r.id) : history.map((d) => d.id);
  useEffect(() => {
    if (!selected || !ids.includes(selected)) setSelected(ids[0] ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, ids.join(",")]);

  const counts = {
    flagged: store.requests.filter((r) => flagsOf(r).length > 0).length,
    clash: store.requests.filter((r) => clashOf(r).length > 0).length,
    approved: store.decisions.filter((d) => d.outcome === "approved").length,
    rejected: store.decisions.filter((d) => d.outcome === "rejected").length,
  };
  const clear = store.requests.filter((r) => flagsOf(r).length === 0 && clashOf(r).length === 0).length;

  const req = tab === "pending" ? store.requests.find((r) => r.id === selected) : undefined;
  const dec = tab === "history" ? store.decisions.find((d) => d.id === selected) : undefined;

  return (
    <WorkPage
      eyebrow="หน้าหลัก"
      title="คำขอจอง"
      lead={<BackLead eyebrow="หน้าหลัก" title="คำขอจอง" onBack={() => navigate("/")} />}
      bell={false}
      actions={
        <>
          {DEMO && (
            <Button variant="white" size="md" className="rq-flow" leading={<Activity size={15} />} onClick={() => navigate("/flow")}>
              Flow แอป ↔ คลินิก
            </Button>
          )}
          <SearchField className="phead-search" value={query} onChange={setQuery} placeholder="ค้นหาชื่อ / HN / เบอร์" shortcut={false} />
          {tab === "pending" ? (
            <FilterMenu
              label="ตัวกรอง"
              value={pf}
              onChange={setPf}
              options={[
                { value: "all", label: "ทั้งหมด", count: store.requests.length, icon: ListFilter },
                { value: "flagged", label: "มีข้อควรระวัง", count: counts.flagged, icon: ShieldAlert },
                { value: "clash", label: "คิวชน · ต้องโทร", count: counts.clash, icon: CalendarRange },
                { value: "clear", label: "พร้อมอนุมัติ", count: clear, icon: ShieldCheck },
              ]}
            />
          ) : (
            <FilterMenu
              label="ตัวกรอง"
              value={hf}
              onChange={setHf}
              options={[
                { value: "all", label: "ทั้งหมด", count: store.decisions.length, icon: ListFilter },
                { value: "approved", label: "อนุมัติแล้ว", count: counts.approved, icon: CircleCheck },
                { value: "rejected", label: "ปฏิเสธ", count: counts.rejected, icon: CircleX },
              ]}
            />
          )}
        </>
      }
    >
      <div className="appt rq">
        {/* list */}
        <aside className="rq__side">
          <Segmented
            label="มุมมองคำขอ"
            value={tab}
            onChange={(t) => setParams(t === "pending" ? {} : { tab: t })}
            options={[
              { value: "pending", label: `รออนุมัติ (${store.requests.length})` },
              { value: "history", label: "ประวัติ" },
            ]}
          />
          <div className="rq__list scroll-y">
            <AnimatePresence initial={false} mode="popLayout">
              {tab === "pending"
                ? pending.map((r) => {
                    const p = store.patientById(r.patientId);
                    const flags = flagsOf(r);
                    const clash = clashOf(r);
                    const stop = flags.some((f) => f.level === "stop");
                    return (
                      <motion.button
                        key={r.id}
                        layout
                        type="button"
                        className="rq__row"
                        aria-pressed={selected === r.id}
                        onClick={() => setSelected(r.id)}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -30 }}
                        transition={spring.soft}
                      >
                        {selected === r.id && <motion.span layoutId="rq-sel" className="rq__sel" transition={spring.snappy} />}
                        <i className={clsx("rq2__bar", stop ? "is-stop" : flags.length || clash.length ? "is-warn" : "is-ok")} />
                        <Avatar name={p.name} src={patientPhoto(p)} size="md" shape="squircle" />
                        <span className="rq__who">
                          <b>{p.name}</b>
                          <small>
                            {store.serviceById(r.serviceId).short} · {timeAgo(r.submittedAt)}
                          </small>
                          <span className="rq__flags">
                            {stop ? <i className="is-stop">ต้องพบแพทย์</i> : flags.length ? <i className="is-warn">ข้อควรระวัง</i> : <i className="is-ok">ผ่านคัดกรอง</i>}
                            {clash.length > 0 && <i className="is-clash">คิวชน</i>}
                          </span>
                        </span>
                        <span className="rq2__when">
                          <b>{thaiDateShort(r.date)}</b>
                          <small>{r.start}</small>
                        </span>
                      </motion.button>
                    );
                  })
                : history.map((d) => {
                    const p = store.patientById(d.request.patientId);
                    const ok = d.outcome === "approved";
                    return (
                      <motion.button
                        key={d.id}
                        layout
                        type="button"
                        className="rq__row"
                        aria-pressed={selected === d.id}
                        onClick={() => setSelected(d.id)}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={spring.soft}
                      >
                        {selected === d.id && <motion.span layoutId="rq-sel" className="rq__sel" transition={spring.snappy} />}
                        <span className="rq__avatar-wrap">
                          <Avatar name={p.name} src={patientPhoto(p)} size="md" shape="squircle" />
                          <span className={clsx("rq__mark", ok ? "is-ok" : "is-no")}>{ok ? <Check size={11} strokeWidth={3.2} /> : <X size={11} strokeWidth={3.2} />}</span>
                        </span>
                        <span className="rq__who">
                          <b>{p.name}</b>
                          <small>
                            {ok ? "อนุมัติ" : "ปฏิเสธ"} · {d.reason ?? store.serviceById(d.request.serviceId).short}
                          </small>
                        </span>
                        <span className="rq__ago">{timeAgo(d.decidedAt)}</span>
                      </motion.button>
                    );
                  })}
            </AnimatePresence>
            {ids.length === 0 && (
              <div className="rq__empty">
                <EmptyState onGlass icon={tab === "pending" ? <CalendarCheck2 size={24} /> : <History size={24} />} title={tab === "pending" ? "ไม่มีคำขอค้างอนุมัติ" : "ยังไม่มีประวัติ"} description={tab === "pending" ? "คำขอใหม่จากแอป ThaiWell จะขึ้นที่นี่" : undefined} />
              </div>
            )}
          </div>
        </aside>

        {/* detail */}
        <div className="panel appt__main">
          <div className="sheet">
            <AnimatePresence mode="wait" initial={false}>
              {req ? (
                <motion.div key={req.id} className="rq__detail" initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.22 }}>
                  <RequestDetail r={req} />
                  <footer className="rq__foot">
                    <Button variant="outline" size="lg" leading={<X size={16} />} onClick={() => setRejecting(req)}>
                      ปฏิเสธ
                    </Button>
                    {/* เปลี่ยนวัน เวลา หรือผู้บำบัดได้ในหน้าต่างอนุมัติ */}
                    <Button size="lg" leading={<CalendarCheck2 size={16} />} onClick={() => setApproving(req)}>
                      อนุมัติและจัดคิว
                    </Button>
                  </footer>
                </motion.div>
              ) : dec ? (
                <motion.div key={dec.id} className="rq__detail" initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.22 }}>
                  <DecisionDetail d={dec} />
                </motion.div>
              ) : (
                <motion.div key="none" className="rq__none" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <EmptyState icon={<CalendarCheck2 size={24} />} title="เลือกคำขอจากรายการ" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <ApproveDialog request={approving} onClose={() => setApproving(null)} />
      <RejectDialog request={rejecting} onClose={() => setRejecting(null)} />
    </WorkPage>
  );
}

function PatientHead({ pid, sub }: { pid: string; sub: React.ReactNode }) {
  const store = useStore();
  const p = store.patientById(pid);
  const el = elementProfile(p);
  const info = ELEMENT_INFO[el.birth];
  return (
    <header className="rq__hero">
      <Avatar name={p.name} src={patientPhoto(p)} size="xl" shape="squircle" />
      <div className="rq__hero-id">
        <h2>{p.name}</h2>
        <p>
          {p.hn} · {p.gender} {p.age} ปี
        </p>
        <div className="rq__chips">
          {sub}
          <span className="rq__el" style={{ ["--c" as string]: info.color, ["--t" as string]: info.tint }}>
            ธาตุ{el.birth}
          </span>
          {p.conditions.map((c) => (
            <Badge key={c} tone="warning" compact>
              {c}
            </Badge>
          ))}
        </div>
      </div>
      {p.phone && (
        <a className="rq__call" href={`tel:${p.phone}`}>
          <Phone size={16} /> {p.phone}
        </a>
      )}
    </header>
  );
}

function RequestDetail({ r }: { r: BookingRequest }) {
  const store = useStore();
  const p = store.patientById(r.patientId);
  const s = store.serviceById(r.serviceId);
  const t = store.therapistById(r.therapistId);
  const flags = evaluateScreening(r.screening, store.settings);
  const clash = requestConflicts(r, store.appointments, store.settings, store.therapists);
  const credits = creditInfo(p, store.appointments);
  const stop = flags.some((f) => f.level === "stop");
  const st = staffState(t, { date: r.date, start: r.start, serviceId: r.serviceId }, store.appointments);
  const visits = store.appointments.filter((a) => a.patientId === p.id && a.status === "done");
  const lastPain = [...p.painHistory].sort((a, b) => b.date.localeCompare(a.date))[0];
  const tone = stop ? "is-stop" : flags.length || clash.length ? "is-warn" : "is-ok";

  return (
    <div className="rq__body scroll-y scroll-y--light">
      <PatientHead pid={r.patientId} sub={<span className="rq__src">จากแอป ThaiWell · {timeAgo(r.submittedAt)}</span>} />

      {/* ซ้ำกับนัดตามคอร์สวันเดียวกัน (แอปรุ่นเก่าจองใหม่แทนการประเมินก่อนนวด) */}
      {(() => {
        const cv = r.courseVisitId ? store.appointments.find((a) => a.id === r.courseVisitId) : undefined;
        // มีนัดอื่นวันเดียวกันแล้ว (1 คน 1 นัดต่อวัน)
        const sd = !cv ? sameDayAppt(store.appointments, p.id, r.date) : undefined;
        if (sd)
          return (
            <div className="rq2__verdict is-warn rq2__dup">
              <span className="rq2__vi">
                <ShieldAlert size={20} />
              </span>
              <div>
                <b>มีนัดวันนี้แล้ว · {thaiDate(sd.date)} {sd.start} น.</b>
                <span>1 คนจองได้วันละ 1 นัด · ถ้าไม่ได้ตั้งใจจองเพิ่ม ให้ปฏิเสธ หรืออนุมัติเป็นวันอื่น</span>
              </div>
              <Button size="md" variant="outline" onClick={() => store.dispatch({ type: "reject", id: r.id, reason: `มีนัดวันเดียวกันแล้ว ${thaiDate(sd.date)} ${sd.start} น.` })}>
                ปฏิเสธ (ซ้ำ)
              </Button>
            </div>
          );
        if (!cv) return null;
        const c = p.course;
        const list = c ? store.appointments.filter((a) => a.patientId === p.id && a.serviceId === c.serviceId && a.date >= c.startedOn && a.status !== "cancelled" && a.status !== "absent").sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)) : [];
        const no = list.findIndex((a) => a.id === cv.id) + 1;
        return (
          <div className="rq2__verdict is-warn rq2__dup">
            <span className="rq2__vi">
              <ShieldAlert size={20} />
            </span>
            <div>
              <b>ซ้ำกับนัดตามคอร์ส{no > 0 && c ? ` ครั้งที่ ${no}/${c.total}` : ""} · {thaiDate(cv.date)} {cv.start} น.</b>
              <span>ผลประเมินย้ายไปนัดตามคอร์สแล้ว · ถ้าไม่ได้จองเพิ่ม ให้ปฏิเสธ</span>
            </div>
            <Button size="md" variant="outline" onClick={() => store.dispatch({ type: "reject", id: r.id, reason: `ซ้ำกับนัดตามคอร์ส ${thaiDate(cv.date)} ${cv.start} น. · ใช้นัดตามคอร์สแทน` })}>
              ปฏิเสธ (ซ้ำ)
            </Button>
          </div>
        );
      })()}
      <div className={clsx("rq2__verdict", tone)}>
        <span className="rq2__vi">{stop || flags.length || clash.length ? <ShieldAlert size={20} /> : <ShieldCheck size={20} />}</span>
        <div>
          <b>{stop ? "ให้แพทย์ประเมินก่อนอนุมัติ" : clash.length ? "คิวชน · โทรยืนยันหรือจัดเวลาใหม่" : flags.length ? "มีข้อควรระวัง · แจ้งผู้บำบัดก่อนนวด" : "พร้อมอนุมัติ"}</b>
          <span>{[...flags.map((f) => f.label), ...clash.map((c) => c.label)].join(", ") || "ผ่านคัดกรอง · คิวว่าง"}</span>
        </div>
      </div>

      <div className="rq2">
        <div className="rq2__main">
          <Ticket
            date={r.date}
            start={r.start}
            minutes={s.minutes}
            label="เวลาที่ขอ"
            clash={clash.length > 0}
            pill={<span className={clash.length ? "rq2__pill is-bad" : "rq2__pill is-good"}>{clash.length ? "คิวชน" : "คิวว่าง"}</span>}
            rows={[
              { k: "บริการ", v: `${s.name} · ${s.minutes} นาที` },
              {
                k: "ผู้บำบัด",
                v: (
                  <>
                    <Avatar name={t.name} src={therapistPhoto(t)} size="xs" color={t.color} />
                    {t.name}
                    <em className={`is-${st}`}>{st === "free" ? "ว่าง" : st === "busy" ? "มีนัดแล้ว" : st === "service" ? "ไม่รับบริการนี้" : "ไม่เข้าเวร"}</em>
                  </>
                ),
                staff: true,
              },
              { k: "ค่าบริการ", v: credits ? `หักเครดิตคอร์ส · เหลือ ${credits.total - credits.used} ครั้ง` : `${s.price} บาท` },
            ]}
          />

          {/* อาการ ความปวด และตำแหน่งที่ปวดอยู่ในแบบประเมินจากแอป (ด้านขวา) — ที่นี่เหลือหมายเหตุและประวัติ */}
          <section className="rq2__card">
            <h3>หมายเหตุและประวัติ</h3>
            {r.note && (
              <blockquote className="rq2__note">
                <MessageSquareText size={14} /> {r.note}
              </blockquote>
            )}
            <div className="rq2__meta">
              <span>
                <UserRound size={13} /> มาแล้ว {visits.length} ครั้ง
              </span>
              {lastPain && (
                <span>
                  ปวดล่าสุด {lastPain.score}/10 · {thaiDateShort(lastPain.date)}
                </span>
              )}
              {p.aiPlan && (
                <span>
                  <Stethoscope size={13} /> แผนการรักษา {p.aiPlan.sessions} ครั้ง
                </span>
              )}
            </div>
          </section>

          <section className="rq2__card">
            <h3>แบบคัดกรองจากแอป</h3>
            <ScreeningAnswers r={r} />
          </section>
        </div>

        <aside className="rq2__side">
          <AssessHistory rounds={r.assessRounds} />
          <AppGuideCard guide={r.appGuide} areas={r.intake?.focusAreas} compact />
          <IntakeCard intake={intakeOfRequest(r, p)} sex={p.gender} element={elementProfile(p).birth} compact />
        </aside>
      </div>
    </div>
  );
}

function DecisionDetail({ d }: { d: RequestDecision }) {
  const store = useStore();
  const r = d.request;
  const p = store.patientById(r.patientId);
  const s = store.serviceById(r.serviceId);
  const ok = d.outcome === "approved";
  const slot = d.slot ?? { date: r.date, start: r.start, therapistId: r.therapistId };
  const moved = ok && (slot.date !== r.date || slot.start !== r.start);
  const t = store.therapistById(slot.therapistId);
  return (
    <div className="rq__body scroll-y scroll-y--light">
      <PatientHead pid={r.patientId} sub={<Badge tone={ok ? "success" : "danger"} compact dot>{ok ? "อนุมัติแล้ว" : "ปฏิเสธ"}</Badge>} />
      <div className={clsx("rq2__verdict", ok ? "is-ok" : "is-stop")}>
        <span className="rq2__vi">{ok ? <CircleCheck size={20} /> : <CircleX size={20} />}</span>
        <div>
          <b>
            {ok ? "อนุมัติ" : "ปฏิเสธ"} โดย {d.decidedBy}
          </b>
          <span>
            {thaiDateLong(d.decidedAt.slice(0, 10))} · {clock(d.decidedAt)} น.
          </span>
          {d.reason && <span>{d.reason}</span>}
        </div>
      </div>

      <div className="rq2">
        <div className="rq2__main">
          <Ticket
            date={slot.date}
            start={slot.start}
            minutes={s.minutes}
            label={ok ? "นัดที่จัดให้" : "เวลาที่ขอ"}
            pill={moved ? <span className="rq2__pill is-good">เปลี่ยนเวลา</span> : undefined}
            rows={[
              { k: "บริการ", v: `${s.name} · ${s.minutes} นาที` },
              {
                k: "ผู้บำบัด",
                v: (
                  <>
                    <Avatar name={t.name} src={therapistPhoto(t)} size="xs" color={t.color} />
                    {t.name}
                  </>
                ),
                staff: true,
              },
              ...(moved ? [{ k: "ผู้ป่วยขอไว้", v: `${thaiDateShort(r.date)} ${r.start} น.` }] : []),
            ]}
          />

          <section className="rq2__card">
            <h3>หมายเหตุถึงผู้ป่วย</h3>
            <p className="rq2__complaint">{d.note ?? (ok ? "แจ้งยืนยันนัดในแอป ThaiWell แล้ว" : "แจ้งเหตุผลในแอป ThaiWell แล้ว")}</p>
          </section>

          <section className="rq2__card">
            <h3>แบบคัดกรองตอนจอง</h3>
            <ScreeningAnswers r={r} />
          </section>
        </div>

        <aside className="rq2__side">
          <AssessHistory rounds={r.assessRounds} />
          <AppGuideCard guide={r.appGuide} areas={r.intake?.focusAreas} compact />
          <IntakeCard intake={intakeOfRequest(r, p)} sex={p.gender} element={elementProfile(p).birth} compact />
        </aside>
      </div>
    </div>
  );
}

/** วัน–เวลาของคำขอ/คิวที่จัดให้ (ใช้ทั้งคำขอที่รออนุมัติและประวัติ) */
function Ticket({ date, start, minutes, label, pill, clash, rows }: { date: string; start: string; minutes: number; label: string; pill?: React.ReactNode; clash?: boolean; rows: { k: string; v: React.ReactNode; staff?: boolean }[] }) {
  const d = new Date(date + "T00:00:00");
  return (
    <section className={clsx("rq2__ticket", clash && "is-clash")}>
      <div className="rq2__date">
        <small>{d.toLocaleDateString("th-TH", { weekday: "short" })}</small>
        <b>{d.getDate()}</b>
        <small>{d.toLocaleDateString("th-TH", { month: "short" })}</small>
      </div>
      <div className="rq2__slot">
        <small>{label}</small>
        <b>
          {start}–{fromMinutes(toMinutes(start) + minutes)} น.
        </b>
        {pill}
      </div>
      <dl className="rq2__kv">
        {rows.map((x) => (
          <div key={x.k}>
            <dt>{x.k}</dt>
            <dd className={x.staff ? "rq__staff" : undefined}>{x.v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** คำตอบแบบคัดกรองตนเองจากแอป + คำแนะนำตามกฎของคลินิก */
function ScreeningAnswers({ r }: { r: BookingRequest }) {
  const store = useStore();
  const flags = evaluateScreening(r.screening, store.settings);
  const qs: { key: keyof typeof r.screening; label: string }[] = [
    { key: "fever", label: "มีไข้" },
    { key: "highBP", label: "ความดันสูง" },
    { key: "contagious", label: "โรคติดต่อ" },
    { key: "recentSurgery", label: `ผ่าตัดไม่เกิน ${store.settings.surgeryRecoveryDays} วัน` },
    { key: "pregnant", label: "ตั้งครรภ์" },
    { key: "menstruation", label: "มีประจำเดือน" },
  ];
  return (
    <>
      <div className="rq2__qs">
        {qs.map((q) => {
          const hit = Boolean(r.screening[q.key]);
          const f = flags.find((x) => x.key === q.key);
          return (
            <div key={q.key} className={clsx("rq2__q", hit && (f?.level === "stop" ? "is-stop" : "is-warn"))}>
              <span>{q.label}</span>
              <b>{q.key === "highBP" && r.screening.bpSystolic ? `${r.screening.bpSystolic} mmHg` : hit ? "ใช่" : "ไม่ใช่"}</b>
            </div>
          );
        })}
      </div>
      {flags.length > 0 && (
        <ul className="rq2__advice">
          {flags.map((f) => (
            <li key={f.key} className={f.level === "stop" ? "is-stop" : "is-warn"}>
              <b>{f.label}</b> · {f.advice}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
