import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, CalendarClock, CalendarCheck2, CalendarRange, Check, CircleCheck, CircleX, History, ListFilter, MessageSquareText, Phone, ShieldAlert, ShieldCheck, Stethoscope, UserRound, X } from "lucide-react";
import { clsx } from "clsx";
import { useStore } from "../../store/store";
import { Avatar, Badge, Button, EmptyState, SearchField, Segmented, spring } from "../../design-system";
import { WorkPage } from "../../layout/WorkPage";
import { PainMini } from "../../features/RecordCards";
import { ApproveDialog, RejectDialog } from "../../features/RequestDialogs";
import { BookDialog, type BookPreset } from "../../features/BookDialog";
import { FilterMenu } from "../../features/FilterMenu";
import { ScreeningGrid } from "../../features/widgets";
import { creditInfo, evaluateScreening, requestConflicts, staffState } from "../../data/domain";
import { ELEMENT_INFO, elementProfile } from "../../data/elements";
import { patientPhoto, therapistPhoto } from "../../data/avatars";
import { fromMinutes, thaiDateLong, thaiDateShort, timeAgo, toMinutes } from "../../data/thaiDate";
import type { BookingRequest, RequestDecision } from "../../data/types";
import { IntakeCard } from "../../features/IntakeCard";
import { intakeOfRequest } from "../../data/intake";
import "../appointments/appointments.css";
import "./requests.css";

type Tab = "pending" | "history";
type PendingFilter = "all" | "flagged" | "clash" | "clear";
type HistoryFilter = "all" | "approved" | "rejected";
const clock = (iso: string) => new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });

/** คำขอจองคิว — queue of booking requests from the ThaiWell AI app (list · detail), and the decision history. */
export default function Requests() {
  const store = useStore();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) ?? "pending";
  const [query, setQuery] = useState("");
  const [pf, setPf] = useState<PendingFilter>("all");
  const [hf, setHf] = useState<HistoryFilter>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [approving, setApproving] = useState<BookingRequest | null>(null);
  const [rejecting, setRejecting] = useState<BookingRequest | null>(null);
  const [booking, setBooking] = useState<BookPreset | null>(null);

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
      eyebrow={
        <Link to="/" className="back-link">
          <ArrowLeft size={14} /> หน้าหลัก
        </Link>
      }
      title="คำขอจองคิว"
      bell={false}
      actions={
        <>
          <SearchField className="phead-search" value={query} onChange={setQuery} placeholder="ค้นหาชื่อ HN เบอร์โทร" shortcut={false} />
          {tab === "pending" ? (
            <FilterMenu
              label="ตัวกรอง"
              value={pf}
              onChange={setPf}
              options={[
                { value: "all", label: "ทั้งหมด", count: store.requests.length, icon: ListFilter },
                { value: "flagged", label: "มีข้อควรระวัง", count: counts.flagged, icon: ShieldAlert },
                { value: "clash", label: "คิวชน ต้องโทรยืนยัน", count: counts.clash, icon: CalendarRange },
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
                <EmptyState onGlass icon={tab === "pending" ? <CalendarCheck2 size={24} /> : <History size={24} />} title={tab === "pending" ? "ไม่มีคำขอค้างอนุมัติ" : "ยังไม่มีประวัติ"} description={tab === "pending" ? "คำขอใหม่จากแอป ThaiWell AI จะแสดงที่นี่" : "การอนุมัติและปฏิเสธจะถูกบันทึกไว้ที่นี่"} />
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
                    <Button variant="outline" size="lg" leading={<CalendarClock size={16} />} onClick={() => setBooking({ requestId: req.id, patientId: req.patientId, serviceId: req.serviceId, therapistId: req.therapistId })}>
                      เลื่อน / จัดคิวใหม่
                    </Button>
                    <Button size="lg" leading={<Check size={16} />} onClick={() => setApproving(req)}>
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
                  <EmptyState icon={<CalendarCheck2 size={24} />} title="เลือกคำขอจากรายการ" description="รายละเอียด ผลคัดกรอง และความพร้อมของคิวจะแสดงที่นี่" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <ApproveDialog request={approving} onClose={() => setApproving(null)} />
      <RejectDialog request={rejecting} onClose={() => setRejecting(null)} />
      <BookDialog preset={booking} onClose={() => setBooking(null)} />
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
  const d = new Date(r.date + "T00:00:00");
  const qs: { key: keyof typeof r.screening; label: string }[] = [
    { key: "fever", label: "มีไข้" },
    { key: "highBP", label: "ความดันสูง" },
    { key: "contagious", label: "โรคติดต่อ" },
    { key: "recentSurgery", label: `ผ่าตัดไม่เกิน ${store.settings.surgeryRecoveryDays} วัน` },
    { key: "pregnant", label: "ตั้งครรภ์" },
    { key: "menstruation", label: "มีประจำเดือน" },
  ];

  return (
    <div className="rq__body scroll-y scroll-y--light">
      <PatientHead pid={r.patientId} sub={<span className="rq__src">ส่งผ่านแอป ThaiWell AI · {timeAgo(r.submittedAt)}</span>} />

      <div className={clsx("rq2__verdict", tone)}>
        <span className="rq2__vi">{stop || flags.length || clash.length ? <ShieldAlert size={20} /> : <ShieldCheck size={20} />}</span>
        <div>
          <b>{stop ? "ควรให้แพทย์แผนไทยประเมินก่อนอนุมัติ" : clash.length ? "คิวที่ขอชน · โทรยืนยันหรือเลื่อนให้ใหม่" : flags.length ? "มีข้อควรระวัง · อนุมัติได้โดยแจ้งผู้บำบัด" : "พร้อมอนุมัติ"}</b>
          <span>{[...flags.map((f) => f.label), ...clash.map((c) => c.label)].join(" · ") || "ผ่านแบบคัดกรองและคิวว่าง"}</span>
        </div>
      </div>

      <div className="rq2">
        <div className="rq2__main">
          {/* ticket */}
          <section className={clsx("rq2__ticket", clash.length ? "is-clash" : "")}>
            <div className="rq2__date">
              <small>{d.toLocaleDateString("th-TH", { weekday: "short" })}</small>
              <b>{d.getDate()}</b>
              <small>{d.toLocaleDateString("th-TH", { month: "short" })}</small>
            </div>
            <div className="rq2__slot">
              <small>ช่วงเวลาที่ขอ</small>
              <b>
                {r.start}–{fromMinutes(toMinutes(r.start) + s.minutes)} น.
              </b>
              <span className={clash.length ? "rq2__pill is-bad" : "rq2__pill is-good"}>{clash.length ? "คิวชน" : "คิวว่าง"}</span>
            </div>
            <dl className="rq2__kv">
              <div>
                <dt>บริการ</dt>
                <dd>
                  {s.name} · {s.minutes} นาที
                </dd>
              </div>
              <div>
                <dt>ผู้บำบัด</dt>
                <dd className="rq__staff">
                  <Avatar name={t.name} src={therapistPhoto(t)} size="xs" color={t.color} />
                  {t.name}
                  <em className={`is-${st}`}>{st === "free" ? "ว่าง" : st === "busy" ? "ติดคิว" : st === "service" ? "ไม่รับบริการนี้" : "ไม่เข้าเวร"}</em>
                </dd>
              </div>
              <div>
                <dt>ค่าบริการ</dt>
                <dd>{credits ? `หักเครดิตคอร์ส · เหลือ ${credits.total - credits.used} ครั้ง` : `${s.price} บาท`}</dd>
              </div>
            </dl>
          </section>

          {/* symptoms */}
          <section className="rq2__card">
            <h3>อาการที่แจ้ง</h3>
            <div className="rq2__pain">
              <PainMini score={r.painScore} />
              <b>ปวด {r.painScore}/10</b>
            </div>
            <p className="rq2__complaint">{p.complaint}</p>
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
                  Pain ล่าสุด {lastPain.score} · {thaiDateShort(lastPain.date)}
                </span>
              )}
              {p.aiPlan && (
                <span>
                  <Stethoscope size={13} /> มีแผนการรักษา {p.aiPlan.sessions} ครั้ง
                </span>
              )}
            </div>
          </section>

          {/* screening answers */}
          <section className="rq2__card">
            <h3>แบบคัดกรองจากแอป</h3>
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
          </section>
        </div>

        <aside className="rq2__side">
          <IntakeCard intake={intakeOfRequest(r, p)} sex={p.gender} element={elementProfile(p).birth} compact />
        </aside>
      </div>
    </div>
  );
}

function DecisionDetail({ d }: { d: RequestDecision }) {
  const store = useStore();
  const r = d.request;
  const s = store.serviceById(r.serviceId);
  const ok = d.outcome === "approved";
  const slot = d.slot ?? { date: r.date, start: r.start, therapistId: r.therapistId };
  const moved = ok && (slot.date !== r.date || slot.start !== r.start);
  const flags = evaluateScreening(r.screening, store.settings);
  return (
    <div className="rq__body scroll-y scroll-y--light">
      <PatientHead pid={r.patientId} sub={<Badge tone={ok ? "success" : "danger"} compact dot>{ok ? "อนุมัติแล้ว" : "ปฏิเสธ"}</Badge>} />
      <div className={clsx("rq__verdict", ok ? "is-ok" : "is-stop")}>
        {ok ? <CircleCheck size={20} /> : <CircleX size={20} />}
        <div>
          <b>
            {ok ? "อนุมัติ" : "ปฏิเสธ"} โดย {d.decidedBy}
          </b>
          <span>
            {thaiDateLong(d.decidedAt.slice(0, 10))} · {clock(d.decidedAt)} น.{d.reason ? ` · ${d.reason}` : ""}
          </span>
        </div>
      </div>
      <div className="rq__grid">
        <section className="rq__card">
          <h3>{ok ? "คิวที่จัดให้" : "ช่วงเวลาที่ขอ"}</h3>
          <div className="rq__slot">
            <span>
              <b>{thaiDateLong(slot.date)}</b>
              <small>
                {slot.start}–{fromMinutes(toMinutes(slot.start) + s.minutes)} น. · {store.therapistById(slot.therapistId).name}
              </small>
            </span>
            {moved && <Badge tone="info" compact>เลื่อนให้ใหม่</Badge>}
          </div>
          {moved && <p className="tw-meta">ผู้ป่วยขอไว้ {thaiDateShort(r.date)} {r.start} น.</p>}
          <div className="rq__kv">
            <span>บริการ</span>
            <b>{s.name}</b>
            <span>Pain ที่แจ้ง</span>
            <b>{r.painScore}/10</b>
          </div>
        </section>
        <section className="rq__card">
          <h3>หมายเหตุถึงผู้ป่วย</h3>
          <p className="rq__complaint">{d.note ?? (ok ? "ระบบแจ้งยืนยันนัดผ่านแอป ThaiWell AI แล้ว" : "ระบบแจ้งเหตุผลผ่านแอป ThaiWell AI แล้ว")}</p>
        </section>
        <section className="rq__card rq__card--wide">
          <h3>แบบคัดกรอง ณ วันที่ส่งคำขอ</h3>
          <ScreeningGrid screening={r.screening} flags={flags} />
        </section>
      </div>
    </div>
  );
}
