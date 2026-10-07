import { useNavigate } from "react-router-dom";
import { CoursePlanDialog } from "../pages/planner/PatientPlanner";
import { useMemo, useState } from "react";
import { ChevronRight, ArrowRight, PersonStanding, CalendarDays, CalendarPlus, HeartPulse, History, Phone, Smartphone, Stethoscope, Ticket, TrendingDown, TrendingUp, Check } from "lucide-react";
import { motion } from "framer-motion";
import { clsx } from "clsx";
import { useStore } from "../store/store";
import { Button, Drawer } from "../design-system";
import { creditInfo, evaluateScreening } from "../data/domain";
import { diffDays, fromISODate, thaiDate, thaiDateShort, todayISO } from "../data/thaiDate";
import { ELEMENT_INFO, elementProfile } from "../data/elements";
import "./patient-health.css";
import "./health.css";
import { IntakeCard, intakeBody } from "./IntakeCard";
import { Body3D, painTone } from "./Body3D";
import { ElementIcon } from "./ElementIcon";
import { toArea, type BodyArea } from "./BodyMap";
import { intakeOfRequest, intakeOfVisit } from "../data/intake";
import { useLatest } from "./useLatest";
import { PhotoPicker } from "./PhotoPicker";
import { SellPackageDialog } from "./SellPackageDialog";
import { patientPhoto } from "../data/avatars";

export function PatientDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const store = useStore();
  const [planFor, setPlanFor] = useState<string | null>(null);
  const shownId = useLatest(id);
  const p = shownId ? store.patients.find((x) => x.id === shownId) : undefined;

  if (!p) return null;

  return (
    <>
    <Drawer
      open={id !== null}
      onClose={onClose}
      leading={<PhotoPicker name={p.name} src={patientPhoto(p)} onPick={(photo) => store.dispatch({ type: "updatePatient", id: p.id, patch: { photo } })} />}
      title={p.name}
      subtitle={`${p.hn} · ${p.gender} ${p.age} ปี · ลงทะเบียน ${thaiDate(p.registeredOn)}`}
      footer={
        <>
          {p.phone && (
            <Button variant="outline" size="lg" fill leading={<Phone size={16} />} onClick={() => (window.location.href = `tel:${p.phone.replace(/-/g, "")}`)}>
              {p.phone}
            </Button>
          )}
          <Button size="lg" fill leading={<CalendarPlus size={16} />} onClick={() => setPlanFor(p.id)}>
            จัดตารางนัด
          </Button>
        </>
      }
    >
      <PatientHealth id={p.id} />
    </Drawer>
    <CoursePlanDialog patientId={planFor} onClose={() => setPlanFor(null)} />
    </>
  );
}

/** the patient's health summary (อาการ · Pain trend · แผน · นัด · ประวัติ) — drawer and the รับบริการ side box */
export function PatientHealth({ id, apptId }: { id: string; /** นัดที่กำลังรักษา → ข้อมูลสุขภาพโฟกัสที่ครั้งนี้ (แบบคัดกรองของนัดนี้) */ apptId?: string }) {
  const store = useStore();
  const appt = apptId ? store.appointments.find((a) => a.id === apptId) : undefined;
  const navigate = useNavigate();
  const [selling, setSelling] = useState(false);
  const [planFor, setPlanFor] = useState<string | null>(null);
  const p = store.patientById(id);
  const visits = useMemo(
    () => store.appointments.filter((a) => a.patientId === p.id).sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start)),
    [store.appointments, p.id],
  );
  const today = todayISO();
  const upcoming = visits.filter((v) => v.date >= today && (v.status === "waiting" || v.status === "active")).reverse();
  const past = visits.filter((v) => !upcoming.includes(v) && v.status !== "cancelled").slice(0, 8);
  const credits = creditInfo(p, store.appointments);
  const trend = [...p.painHistory].sort((a, b) => a.date.localeCompare(b.date)).map((h) => ({ label: thaiDateShort(h.date), value: h.score }));
  const first = trend[0]?.value ?? 0;
  const last = trend[trend.length - 1]?.value ?? 0;
  const better = trend.length >= 2 && last < first;
  const el = elementProfile(p);
  const ei = ELEMENT_INFO[el.birth];
  // latest pre-visit assessment: a pending request first, then the nearest booked visit, then the last one
  const intake = (() => {
    // นัดที่กำลังรักษา: ใช้แบบประเมินของนัดนี้เท่านั้น (ไม่เอาของครั้งอื่นมาแทน)
    if (appt) return intakeOfVisit(appt, p);
    const req = store.requests.filter((r) => r.patientId === p.id).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0];
    if (req) return intakeOfRequest(req, p);
    for (const v of [...upcoming, ...past]) {
      const i = intakeOfVisit(v, p);
      if (i) return i;
    }
    return null;
  })();

  // นัดนี้: รอบประเมินล่าสุดจากแอป · ครั้งที่ของคอร์ส · ข้อห้ามจากแบบคัดกรอง
  const round = appt?.assessRounds?.[appt.assessRounds.length - 1];
  const courseNo = (() => {
    const c = p.course;
    if (!appt || !c || appt.serviceId !== c.serviceId) return null;
    const list = visits.filter((v) => v.serviceId === c.serviceId && v.date >= c.startedOn && v.status !== "cancelled" && v.status !== "absent").sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    const i = list.findIndex((v) => v.id === appt.id);
    return i < 0 ? null : { no: i + 1, total: c.total };
  })();
  const apptFlags = appt?.screening ? evaluateScreening(appt.screening, store.settings) : [];
  const latest = appt ? (round?.pain ?? (intake ? intake.pain : undefined)) : trend[trend.length - 1]?.value;
  // areas treated before (from procedure records), most frequent first
  const treatedCount: Record<string, number> = {};
  for (const v of past) for (const pr of v.procedures ?? []) for (const a of (pr.area ?? "").split(/[,·]\s*/)) {
    const r = toArea(a.trim());
    if (r) treatedCount[r] = (treatedCount[r] ?? 0) + 1;
  }
  const treated = Object.entries(treatedCount).sort((a, b) => b[1] - a[1]);
  const fromIntake = intake ? intakeBody(intake) : null;
  const maxT = treated[0]?.[1] ?? 1;
  // counter screening (body marked at registration) when there is no app intake
  const sc = p.screening;
  const scAreas = (xs: string[]) => xs.map((x) => toArea(x.trim())).filter((x): x is BodyArea => !!x);
  const fromScreening = !fromIntake && sc && (sc.painAreas?.length || sc.avoid) ? { heatmap: Object.fromEntries(scAreas(sc.painAreas ?? []).map((a) => [a, Math.max(0.35, (sc.pain ?? 6) / 10)])) as Partial<Record<BodyArea, number>>, avoid: scAreas(sc.avoid.split(/[,·]\s*/)) } : null;
  const fromApp = fromIntake ?? fromScreening;
  const bodyHeat: Partial<Record<BodyArea, number>> = fromApp && Object.keys(fromApp.heatmap).length ? fromApp.heatmap : Object.fromEntries(treated.map(([a, n]) => [a, 0.3 + (n / maxT) * 0.35]));
  const bodyAvoid = fromApp?.avoid ?? [];
  const focusList = (Object.entries(bodyHeat) as [BodyArea, number][]).sort((a, b) => b[1] - a[1]).map(([a]) => a);
  const delta = first ? Math.round(((first - last) / Math.max(1, first)) * 100) : 0;
  const tone = (v: number) => (v >= 7 ? "#d4583f" : v >= 4 ? "#e0a32a" : "#3f9a5f");

  return (
    <div className="ph hx" style={{ ["--c" as string]: ei.color, ["--t" as string]: ei.tint }}>
      {/* แบบคัดกรองของนัดนี้ — โฟกัสข้อมูลที่ต้องรักษาครั้งนี้ */}
      {appt && (
        <section className={clsx("hx-visit", !intake && "is-missing", (round?.previsit?.red || apptFlags.some((f) => f.level === "stop")) && "is-stop")}>
          <div className="hx-visit__head">
            <b>แบบคัดกรองของนัดนี้</b>
            <small>
              {thaiDateShort(appt.date)} {appt.start} น.{courseNo ? ` · คอร์สครั้งที่ ${courseNo.no}/${courseNo.total}` : ""}
            </small>
          </div>
          {intake ? (
            <>
              <div className="hx-visit__pain">
                <span>
                  <small>ปวดก่อนนวดครั้งนี้</small>
                  <b style={{ color: painTone(intake.pain)[1] }}>
                    {round?.pain ?? intake.pain}
                    <i>/10</i>
                  </b>
                </span>
                <em>
                  <Smartphone size={12} /> ประเมินในแอป {new Date(round?.at ?? intake.at).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} น.
                </em>
              </div>
              <ul className="hx-visit__qa">
                {round?.previsit?.adverse && (
                  <li>
                    <small>หลังนวดครั้งก่อน</small>
                    <b className={round.previsit.adverse !== "ไม่มี" ? "is-warn" : undefined}>{round.previsit.adverse}</b>
                  </li>
                )}
                {round?.previsit?.risk && (
                  <li>
                    <small>ข้อห้ามใหม่</small>
                    <b className={round.previsit.risk !== "ไม่มี" ? "is-warn" : undefined}>{round.previsit.risk}</b>
                  </li>
                )}
                <li>
                  <small>ผลคัดกรอง</small>
                  <b className={apptFlags.length || round?.previsit?.red ? "is-warn" : "is-ok"}>
                    {round?.previsit?.red ? "ควรพบแพทย์ก่อนนวด" : apptFlags.length ? apptFlags.map((f) => f.label).join(" · ") : "ผ่าน · ไม่มีข้อห้าม"}
                  </b>
                </li>
                {appt.addenda?.length ? (
                  <li>
                    <small>แจ้งเพิ่มหลังเช็กอิน</small>
                    <b className="is-warn">{appt.addenda[appt.addenda.length - 1].text}</b>
                  </li>
                ) : null}
              </ul>
            </>
          ) : (
            <p className="hx-visit__none">
              ผู้ป่วยยังไม่ได้ประเมินในแอปสำหรับนัดนี้ · สอบถามอาการและคัดกรองที่เคาน์เตอร์ก่อนนวด
              {(() => {
                const prev = visits.find((v) => v.id !== appt.id && v.painAfter !== undefined && `${v.date}${v.start}` < `${appt.date}${appt.start}`);
                return prev ? <small className="hx-prev"> · ล่าสุด: หลังนวดครั้งก่อน {prev.painAfter}/10 ({thaiDateShort(prev.date)})</small> : null;
              })()}
            </p>
          )}
        </section>
      )}
      {/* body overview first: where to treat */}
      <p className="hx-label hx-label--first">
        <PersonStanding size={13} /> ตำแหน่งที่ควรดูแล
        <small>{intake ? (appt ? "จากแบบประเมินของนัดนี้" : "จากแบบประเมินล่าสุด") : treated.length ? "จากหัตถการที่เคยทำ" : ""}</small>
      </p>
      <section className="hx-card hx-body">
        <Body3D compact sex={p.gender} heatmap={bodyHeat} avoid={bodyAvoid} />
        {(focusList.length > 0 || bodyAvoid.length > 0) && (
          <div className="hx-body__lists">
            {focusList.length > 0 && (
              <div>
                <small>ควรเน้น</small>
                <span>
                  {focusList.map((a) => (
                    <em key={a} className="is-focus">
                      {a}
                    </em>
                  ))}
                </span>
              </div>
            )}
            {bodyAvoid.length > 0 && (
              <div>
                <small>ห้ามนวด</small>
                <span>
                  {bodyAvoid.map((a) => (
                    <em key={a} className="is-avoid">
                      {a}
                    </em>
                  ))}
                </span>
              </div>
            )}
            {treated.length > 0 && (
              <div>
                <small>เคยทำ</small>
                <span>
                  {treated.slice(0, 5).map(([a, n]) => (
                    <em key={a}>
                      {a} ×{n}
                    </em>
                  ))}
                </span>
              </div>
            )}
          </div>
        )}
      </section>

      {/* pain now + trend + quick facts */}
      <section className="hx-hero">
        <div className="hx-hero__top">
          <div className="hx-hero__text">
            <small>{appt ? "Pain ก่อนนวดครั้งนี้" : "Pain Score ล่าสุด"}</small>
            <b style={latest !== undefined ? { color: painTone(latest)[1] } : undefined}>
              {latest ?? "—"}
              <i>/10</i>
            </b>
            {trend.length >= 2 ? (
              <span className={clsx("hx-trend", better ? "is-good" : "is-bad")}>
                {better ? <TrendingDown size={13} /> : <TrendingUp size={13} />}
                {better ? `ดีขึ้น ${delta}% จาก ${first}` : `ยังไม่ดีขึ้น · เริ่ม ${first}`}
              </span>
            ) : (
              <span className="hx-trend">ยังไม่มีข้อมูลเทียบ</span>
            )}
          </div>
        </div>
        {trend.length >= 2 && <PainChart points={trend} color="#6b7a71" />}
        <div className="hx-facts">
          <span className="is-el">
            <small>ธาตุเจ้าเรือน</small>
            <b>
              <em>
                <ElementIcon element={el.birth} size={12} strokeWidth={2.4} />
              </em>
              {el.birth}
            </b>
          </span>
        </div>
      </section>

      {/* complaint */}
      <p className="hx-label">
        <Stethoscope size={13} /> อาการสำคัญ
      </p>
      <section className="hx-card hx-complaint">
        <p>
          {(appt && intake?.complaint) || p.complaint}
          {appt && !intake && p.complaint ? <small className="hx-prev"> (จากครั้งก่อน)</small> : null}
        </p>
        <div className="hx-tags">
          {p.conditions.length ? (
            p.conditions.map((c) => (
              <span key={c} className="is-warn">
                <HeartPulse size={12} /> {c}
              </span>
            ))
          ) : (
            <span>ไม่มีโรคประจำตัว</span>
          )}
        </div>
      </section>

      {/* pre-visit self-assessment from the app */}
      {intake && (
        <>
          <p className="hx-label">
            <Smartphone size={13} /> {appt ? "แบบประเมินของนัดนี้" : "แบบประเมินล่าสุด"}
          </p>
          <IntakeCard intake={intake} compact sex={p.gender} body={false} />
        </>
      )}

      {/* course */}
      <p className="hx-label">
        <Ticket size={13} /> คอร์สการรักษา
      </p>
      {credits && p.course ? (
        (() => {
          const c = p.course;
          const daysLeft = diffDays(c.expiresOn, today);
          const span = Math.max(1, diffDays(c.expiresOn, c.startedOn));
          const elapsed = Math.min(1, Math.max(0, diffDays(today, c.startedOn) / span));
          const next = upcoming.find((v) => v.serviceId === c.serviceId) ?? upcoming[0];
          const bookedDates = upcoming.filter((v) => v.serviceId === c.serviceId).map((v) => v.date);
          return (
            <section className="hx-card hx-course2">
              <div className="hx-course2__head">
                <span className="hx-course2__icon">
                  <Ticket size={16} />
                </span>
                <div>
                  <b>{c.name}</b>
                  <small>{store.serviceById(c.serviceId).name}</small>
                </div>
                <em className={clsx("hx-course2__days", daysLeft <= 7 && "is-soon", daysLeft < 0 && "is-over")}>{daysLeft < 0 ? "หมดอายุ" : daysLeft === 0 ? "หมดวันนี้" : `เหลือ ${daysLeft} วัน`}</em>
              </div>

              <div className="hx-tix" style={{ gridTemplateColumns: `repeat(${Math.min(credits.total, 10)}, minmax(0, 1fr))` }}>
                {Array.from({ length: credits.total }, (_, k) => {
                  const st = k < credits.used ? "used" : k < credits.used + credits.booked ? "booked" : "free";
                  const bd = st === "booked" ? bookedDates[k - credits.used] : undefined;
                  return (
                    <motion.span
                      key={k}
                      className={`hx-tix__t is-${st}`}
                      title={st === "used" ? `ครั้งที่ ${k + 1} · ใช้แล้ว` : st === "booked" ? `ครั้งที่ ${k + 1} · จองไว้ ${bd ? thaiDateShort(bd) : ""}` : `ครั้งที่ ${k + 1} · ว่าง`}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.04 * k }}
                    >
                      {st === "used" ? <Check size={12} strokeWidth={3} /> : k + 1}
                    </motion.span>
                  );
                })}
              </div>

              <div className="hx-course2__nums">
                <span>
                  <b>{credits.used}</b>
                  <small>ใช้แล้ว</small>
                </span>
                <span className="is-booked">
                  <b>{credits.booked}</b>
                  <small>จองไว้</small>
                </span>
                <span className="is-left">
                  <b>{credits.remaining}</b>
                  <small>คงเหลือ</small>
                </span>
              </div>

              <div className="hx-period">
                <div className="hx-period__bar">
                  <motion.i initial={{ width: 0 }} animate={{ width: `${elapsed * 100}%` }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
                  <span className="hx-period__now" style={{ left: `${elapsed * 100}%` }} title="วันนี้" />
                </div>
                <div className="hx-period__ends">
                  <small>เริ่ม {thaiDateShort(c.startedOn)}</small>
                  <small>หมดอายุ {thaiDateShort(c.expiresOn, true)}</small>
                </div>
              </div>

              <div className="hx-course2__foot">
                <span>
                  <CalendarDays size={13} />
                  {next ? (
                    <>
                      ครั้งถัดไป <b>{thaiDateShort(next.date)} · {next.start}</b>
                    </>
                  ) : (
                    "ยังไม่มีนัดครั้งถัดไป"
                  )}
                </span>
                {/* "ต่อคอร์ส" = ขาย/ต่ออายุคอร์ส (เหมือนหน้าข้อมูลผู้ป่วย) · ยังมีครั้งเหลือ = จัดตารางนัด */}
                {credits.remaining === 0 && credits.booked === 0 ? (
                  <button type="button" onClick={() => setSelling(true)}>
                    ต่อคอร์ส
                  </button>
                ) : (
                  <button type="button" onClick={() => setPlanFor(p.id)}>
                    จัดตารางนัด
                  </button>
                )}
              </div>
            </section>
          );
        })()
      ) : (
        <section className="hx-card hx-course2 is-empty">
          <p className="hx-muted">ไม่มีคอร์ส — รับบริการรายครั้ง</p>
          <button type="button" className="hx-course2__start" onClick={() => setPlanFor(p.id)}>
            เปิดคอร์สการรักษา
          </button>
        </section>
      )}

      {/* upcoming */}
      <p className="hx-label">
        <CalendarDays size={13} /> นัดที่กำลังจะถึง {upcoming.length > 0 && <em>{upcoming.length}</em>}
      </p>
      {upcoming.length ? (
        <div className="hx-next">
          {upcoming.slice(0, 4).map((v, k) => (
            <button type="button" key={v.id} className={clsx("hx-next__item", k === 0 && "is-first")} onClick={() => navigate(`/appointments/${v.id}`)}>
              <span className="hx-next__date">
                <small>{thaiDateShort(v.date).split(" ")[1]}</small>
                <b>{fromISODate(v.date).getDate()}</b>
              </span>
              <span className="hx-next__body">
                <b>
                  {v.start} น. · {store.serviceById(v.serviceId).short}
                </b>
                <small>{store.therapistById(v.therapistId).name}</small>
              </span>
              {v.date === today && <em>วันนี้</em>}
              <ChevronRight size={15} className="hx-next__go" />
            </button>
          ))}
        </div>
      ) : (
        <section className="hx-card">
          <p className="hx-muted">ยังไม่มีนัด</p>
        </section>
      )}

      {/* history */}
      <p className="hx-label">
        <History size={13} /> ประวัติการรับบริการ
      </p>
      <section className="hx-card">
        {past.length ? (
          <ol className="hx-hist">
            {past.map((v) => (
              <li key={v.id} className={v.status === "absent" ? "is-absent" : undefined}>
                <span className="hx-hist__date">{thaiDateShort(v.date)}</span>
                <span className="hx-hist__body">
                  <b>{store.serviceById(v.serviceId).short}</b>
                  {v.status === "absent" ? <small>ไม่มารับบริการ</small> : v.diagnoses?.[0] ? <small>{v.diagnoses[0].name}</small> : null}
                </span>
                {v.painAfter !== undefined && (
                  <span className="hx-hist__pain" style={{ ["--p" as string]: tone(v.painAfter) }}>
                    {v.painBefore}
                    <ArrowRight size={10} />
                    {v.painAfter}
                  </span>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="hx-muted">ยังไม่มีประวัติ</p>
        )}
      </section>
      <CoursePlanDialog patientId={planFor} onClose={() => setPlanFor(null)} />
      <SellPackageDialog patientId={selling ? p.id : null} onClose={() => setSelling(false)} />
    </div>
  );
}

/** pain over visits: gridlines 0/5/10, smooth neutral line, a dot per visit coloured by pain level, value + date labels */
function PainChart({ points }: { points: { label: string; value: number }[]; color?: string }) {
  const pts = points.slice(-8);
  const W = 300;
  const H = 120;
  const L = 20; // y-axis labels
  const R = 10;
  const T = 18; // room for value labels
  const B = 22; // room for dates
  const x = (k: number) => L + (k * (W - L - R)) / Math.max(1, pts.length - 1);
  const y = (v: number) => T + ((10 - v) / 10) * (H - T - B);
  let d = `M${x(0)},${y(pts[0].value)}`;
  for (let k = 1; k < pts.length; k++) {
    const cx = (x(k - 1) + x(k)) / 2;
    d += ` C${cx},${y(pts[k - 1].value)} ${cx},${y(pts[k].value)} ${x(k)},${y(pts[k].value)}`;
  }
  const area = `${d} L${x(pts.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  const tone = (v: number) => (v >= 7 ? "#d8392a" : v >= 4 ? "#e08a1e" : "#2f9a5b");
  const DRAW = 1.2;
  return (
    <svg className="hx-line" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="แนวโน้ม Pain Score">
      <defs>
        <linearGradient id="hx-line-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4a5a51" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#4a5a51" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="hx-line-stroke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#9aa8a0" />
          <stop offset="100%" stopColor="#33433a" />
        </linearGradient>
      </defs>
      {[0, 5, 10].map((g) => (
        <g key={g}>
          <line x1={L} x2={W - R} y1={y(g)} y2={y(g)} className="hx-line__grid" />
          <text x={L - 6} y={y(g)} className="hx-line__y">
            {g}
          </text>
        </g>
      ))}
      {/* area rises from the baseline */}
      <motion.path
        d={area}
        fill="url(#hx-line-fill)"
        style={{ transformOrigin: `0px ${y(0)}px` }}
        initial={{ scaleY: 0, opacity: 0 }}
        animate={{ scaleY: 1, opacity: 1 }}
        transition={{ delay: 0.2, duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
      />
      {/* soft shadow + line, drawn left to right */}
      <motion.path d={d} className="hx-line__shadow" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: DRAW, ease: "easeInOut" }} />
      <motion.path d={d} className="hx-line__path" stroke="url(#hx-line-stroke)" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: DRAW, ease: "easeInOut" }} />
      {pts.map((p, k) => {
        const last = k === pts.length - 1;
        const at = (DRAW * k) / Math.max(1, pts.length - 1); // when the line reaches this point
        return (
          <g key={k}>
            {last && <circle cx={x(k)} cy={y(p.value)} r={5} className="hx-line__pulse" style={{ ["--c" as string]: tone(p.value), animationDelay: `${at + 0.3}s` }} />}
            <motion.circle
              cx={x(k)}
              cy={y(p.value)}
              r={last ? 5 : 3.6}
              fill="#fff"
              stroke={tone(p.value)}
              strokeWidth={last ? 2.6 : 2}
              style={{ transformOrigin: `${x(k)}px ${y(p.value)}px` }}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: at, type: "spring", stiffness: 520, damping: 16 }}
            />
            {last ? (
              <motion.g initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: at + 0.1, duration: 0.35 }}>
                <rect x={x(k) - 11} y={y(p.value) - 25} width={22} height={15} rx={7.5} fill={tone(p.value)} />
                <text x={x(k)} y={y(p.value) - 17.2} className="hx-line__v is-last">
                  {p.value}
                </text>
              </motion.g>
            ) : (
              <motion.text x={x(k)} y={y(p.value) - 8} className="hx-line__v" fill={tone(p.value)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: at + 0.1 }}>
                {p.value}
              </motion.text>
            )}
            <text x={x(k)} y={H - 6} className="hx-line__x">
              {p.label.replace(/ \d+$/, "")}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
