import { CoursePlanDialog } from "../planner/PatientPlanner";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, PenLine, CalendarDays, CalendarPlus, Check, HeartPulse, History, Phone, Stethoscope, Ticket, TriangleAlert, TrendingDown, TrendingUp } from "lucide-react";
import { useStore } from "../../store/store";
import { Badge, Button, EmptyState, ease } from "../../design-system";
import { stageMeta, creditInfo } from "../../data/domain";
import { patientPhoto } from "../../data/avatars";
import { relativeDay, thaiDate, thaiDateShort, todayISO } from "../../data/thaiDate";
import { PhotoPicker } from "../../features/PhotoPicker";
import { PainMini } from "../../features/RecordCards";
import { AIPlanCard, AIPlanTeaser, ElementCard } from "../../features/AIPlan";
import { painColor } from "../../features/widgets";
import "../../features/health.css";

/** Donut showing used / booked / free sessions of a treatment plan. */

/** Pain trend chart with axis, points and value labels. */
function PainChart({ points }: { points: { date: string; score: number }[] }) {
  const W = 520;
  const H = 150;
  const pad = { l: 26, r: 14, t: 18, b: 26 };
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / Math.max(1, points.length - 1);
  const y = (v: number) => pad.t + (1 - v / 10) * (H - pad.t - pad.b);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.score)}`).join(" ");
  const area = `${d} L${x(points.length - 1)},${H - pad.b} L${x(0)},${H - pad.b} Z`;
  return (
    <svg className="pchart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="กราฟ Pain Score">
      <defs>
        <linearGradient id="pc-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#4c845a" stopOpacity="0.2" />
          <stop offset="1" stopColor="#4c845a" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 5, 10].map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--sage-100)" strokeDasharray={v ? "3 4" : undefined} />
          <text x={pad.l - 8} y={y(v) + 4} textAnchor="end">{v}</text>
        </g>
      ))}
      <motion.path d={area} fill="url(#pc-fill)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} />
      <motion.path d={d} fill="none" stroke="#4c845a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8, ease: ease.out }} />
      {points.map((p, i) => (
        <g key={p.date + i}>
          <motion.circle cx={x(i)} cy={y(p.score)} r="5" fill="#fff" stroke={painColor(p.score)} strokeWidth="3"
            initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.3 + i * 0.06 }} />
          <text x={x(i)} y={y(p.score) - 11} textAnchor="middle" className="pchart__v">{p.score}</text>
          <text x={x(i)} y={H - 6} textAnchor="middle">{thaiDateShort(p.date)}</text>
        </g>
      ))}
    </svg>
  );
}

export function PatientDetail({ id, onAdd, onEdit, onAIPlan, aiOpen }: { id: string | null; onAdd: () => void; onEdit?: () => void; /** opens the AI plan side panel (wide layout) */ onAIPlan?: () => void; aiOpen?: boolean }) {
  const store = useStore();
  const [planFor, setPlanFor] = useState<string | null>(null);
  const p = id ? store.patients.find((x) => x.id === id) : undefined;
  const today = todayISO();

  const visits = useMemo(
    () => (p ? store.appointments.filter((a) => a.patientId === p.id).sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start)) : []),
    [store.appointments, p],
  );

  if (!p)
    return (
      <div className="pd pd--empty">
        <EmptyState icon={<CalendarPlus size={24} />} title="เลือกผู้รับบริการจากรายการ" description="หรือเพิ่มผู้รับบริการใหม่" action={<Button onClick={onAdd}>เพิ่มผู้รับบริการ</Button>} />
      </div>
    );

  const credits = creditInfo(p, store.appointments);
  const upcoming = visits.filter((v) => v.date >= today && (v.status === "waiting" || v.status === "active")).reverse();
  const past = visits.filter((v) => !upcoming.includes(v)).slice(0, 10);
  const doneCount = visits.filter((v) => v.status === "done").length;
  const h = [...p.painHistory].sort((a, b) => a.date.localeCompare(b.date));
  const first = h[0]?.score;
  const last = h[h.length - 1]?.score;
  const delta = first !== undefined && last !== undefined ? last - first : 0;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={p.id}
        className="pd scroll-y scroll-y--light"
        initial={{ opacity: 0, x: 14 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -10, transition: { duration: 0.12 } }}
        transition={{ duration: 0.3, ease: ease.out }}
      >
        {/* Identity */}
        <header className="pd__hero">
          <PhotoPicker name={p.name} src={patientPhoto(p)} size="2xl" onPick={(photo) => store.dispatch({ type: "updatePatient", id: p.id, patch: { photo } })} />
          <div className="pd__id">
            <h2>{p.name}</h2>
            <p>
              {p.hn} · {p.gender} {p.age} ปี · ลงทะเบียน {thaiDate(p.registeredOn)}
            </p>
            <div className="tags">
              {p.conditions.length ? (
                p.conditions.map((c) => (
                  <Badge key={c} tone="warning" compact>
                    {c}
                  </Badge>
                ))
              ) : (
                <Badge tone="neutral" compact>
                  ไม่มีโรคประจำตัว
                </Badge>
              )}
              {p.allergies?.map((a) => (
                <Badge key={a} tone="danger" compact>
                  แพ้ {a}
                </Badge>
              ))}
            </div>
          </div>
          <div className="pd__actions pd__icons">
            {onEdit && (
              <button type="button" className="pd__ib" onClick={onEdit} aria-label="แก้ไขข้อมูล" title="แก้ไขข้อมูล">
                <PenLine size={18} />
              </button>
            )}
            <button type="button" className="pd__ib" onClick={() => (window.location.href = `tel:${p.phone.replace(/-/g, "")}`)} aria-label={`โทร ${p.phone}`} title={`โทร ${p.phone}`}>
              <Phone size={18} />
            </button>
            <button type="button" className="pd__ib is-primary" onClick={() => setPlanFor(p.id)} aria-label="จัดตารางนัด" title="จัดตารางนัด">
              <CalendarPlus size={18} />
            </button>
          </div>
        </header>

        {/* Quick stats */}
        <div className="pd__stats">
          <div className="pd__stat">
            <small>รับบริการแล้ว</small>
            <b>{doneCount}</b>
            <span>ครั้ง</span>
          </div>
          <div className="pd__stat">
            <small>Pain ล่าสุด</small>
            <b style={{ color: last !== undefined ? painColor(last) : undefined }}>{last ?? "—"}</b>
            <span>/10</span>
          </div>
          <div className="pd__stat">
            <small>เปลี่ยนแปลง</small>
            <b style={{ color: delta < 0 ? "var(--green-700)" : delta > 0 ? "var(--color-danger)" : undefined }}>
              {delta < 0 ? <TrendingDown size={18} /> : delta > 0 ? <TrendingUp size={18} /> : null}
              {delta === 0 ? "—" : Math.abs(delta)}
            </b>
            <span>{delta < 0 ? "ดีขึ้น" : delta > 0 ? "แย่ลง" : ""}</span>
          </div>
          <div className="pd__stat">
            <small>นัดถัดไป</small>
            <b className="pd__stat-text">{upcoming[0] ? `${thaiDateShort(upcoming[0].date)} ${upcoming[0].start}` : "—"}</b>
            <span>{upcoming[0] ? relativeDay(upcoming[0].date) : "ยังไม่มีนัด"}</span>
          </div>
        </div>

        <div className="pd__grid">
          {onAIPlan ? <AIPlanTeaser p={p} open={!!aiOpen} onOpen={onAIPlan} /> : <AIPlanCard p={p} />}
          {/* ── row: complaint & personal | course ── */}
          <section className="pd__card pd2">
            <h3 className="pd2__h">
              <span className="pd2__i" style={{ ["--c" as string]: "#2f8a52" }}>
                <Stethoscope size={15} />
              </span>
              อาการสำคัญ
            </h3>
            <p className="pd2__quote">{p.complaint}</p>
            <div className="pd2__chips">
              {p.conditions.map((c) => (
                <em key={c} className="is-cond">
                  <HeartPulse size={12} /> {c}
                </em>
              ))}
              {p.allergies?.map((a) => (
                <em key={a} className="is-allergy">
                  <TriangleAlert size={12} /> แพ้ {a}
                </em>
              ))}
              {!p.conditions.length && !p.allergies?.length && <em>ไม่มีโรคประจำตัว · ไม่มีประวัติแพ้</em>}
            </div>
            {(p.birthDate || p.citizenId || p.emergency) && (
              <dl className="pd2__kv">
                {p.birthDate && (
                  <div>
                    <dt>วันเกิด</dt>
                    <dd>{thaiDate(p.birthDate)}</dd>
                  </div>
                )}
                {p.citizenId && (
                  <div>
                    <dt>เลขบัตรประชาชน</dt>
                    <dd>{p.citizenId.replace(/^(\d)(\d{4})(\d{5})(\d{2})(\d)$/, "$1-$2-$3-$4-$5")}</dd>
                  </div>
                )}
                {p.emergency && (
                  <div>
                    <dt>ติดต่อฉุกเฉิน</dt>
                    <dd>
                      {p.emergency.name}
                      {p.emergency.relation ? ` (${p.emergency.relation})` : ""} · {p.emergency.phone}
                    </dd>
                  </div>
                )}
              </dl>
            )}
          </section>

          <section className="pd__card pd2">
            <h3 className="pd2__h">
              <span className="pd2__i" style={{ ["--c" as string]: "#d08a3c" }}>
                <Ticket size={15} />
              </span>
              คอร์สการรักษา
              {credits && <em className={credits.remaining <= 1 ? "is-low" : undefined}>เหลือ {credits.remaining} ครั้ง</em>}
            </h3>
            {credits && p.course ? (
              <>
                <b className="pd2__course">{p.course.name}</b>
                <div className="hx-tix" style={{ gridTemplateColumns: `repeat(${Math.min(credits.total, 10)}, minmax(0, 1fr))` }}>
                  {Array.from({ length: credits.total }, (_, k) => {
                    const st = k < credits.used ? "used" : k < credits.used + credits.booked ? "booked" : "free";
                    return (
                      <span key={k} className={`hx-tix__t is-${st}`}>
                        {st === "used" ? <Check size={12} strokeWidth={3} /> : k + 1}
                      </span>
                    );
                  })}
                </div>
                <div className="pd2__legend">
                  <span>
                    <i className="is-used" /> ใช้แล้ว {credits.used}
                  </span>
                  <span>
                    <i className="is-booked" /> จองไว้ {credits.booked}
                  </span>
                  <span>
                    <i /> ว่าง {credits.remaining}
                  </span>
                </div>
                <small className="pd2__muted">
                  {thaiDate(p.course.startedOn)} – {thaiDate(p.course.expiresOn)}
                </small>
              </>
            ) : (
              <p className="pd2__muted">ไม่มีคอร์ส — รับบริการแบบชำระรายครั้ง</p>
            )}
          </section>

          {/* ── element (full width) ── */}
          <ElementCard p={p} />

          {/* ── pain trend (full width) ── */}
          <section className="pd__card pd__card--wide pd2">
            <h3 className="pd2__h">
              <span className="pd2__i" style={{ ["--c" as string]: "#c2482b" }}>
                <Activity size={15} />
              </span>
              แนวโน้ม Pain Score
              {first !== undefined && last !== undefined && h.length > 1 && (
                <em className={last < first ? "is-good" : "is-bad"}>
                  {first} → {last}
                  {last < first ? ` · ดีขึ้น ${Math.round(((first - last) / first) * 100)}%` : ""}
                </em>
              )}
            </h3>
            {h.length > 1 ? <PainChart points={h} /> : <p className="pd2__muted">ยังไม่มีข้อมูลการประเมิน — จะเริ่มบันทึกหลังรับบริการครั้งแรก</p>}
          </section>

          {/* ── row: upcoming | history ── */}
          <section className="pd__card pd2">
            <h3 className="pd2__h">
              <span className="pd2__i" style={{ ["--c" as string]: "#3b82c4" }}>
                <CalendarDays size={15} />
              </span>
              นัดที่จะถึง
              {upcoming.length > 0 && <em>{upcoming.length}</em>}
            </h3>
            {upcoming.length ? (
              <div className="hx-next">
                {upcoming.slice(0, 5).map((v, k) => (
                  <div key={v.id} className={k === 0 ? "hx-next__item is-first" : "hx-next__item"}>
                    <span className="hx-next__date">
                      <small>{thaiDateShort(v.date).split(" ")[1]}</small>
                      <b>{Number(v.date.slice(8))}</b>
                    </span>
                    <span className="hx-next__body">
                      <b>
                        {v.start} น. · {store.serviceById(v.serviceId).short}
                      </b>
                      <small>{store.therapistById(v.therapistId).name}</small>
                    </span>
                    {v.date === today && <em>วันนี้</em>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="pd2__muted">ยังไม่มีนัดหมาย</p>
            )}
          </section>

          <section className="pd__card pd2">
            <h3 className="pd2__h">
              <span className="pd2__i" style={{ ["--c" as string]: "#7c5cc4" }}>
                <History size={15} />
              </span>
              ประวัติการรับบริการ
            </h3>
            {past.length ? (
              <ol className="hx-hist">
                {past.map((v) => (
                  <li key={v.id} className={v.status === "absent" ? "is-absent" : undefined}>
                    <span className="hx-hist__date">{thaiDateShort(v.date)}</span>
                    <span className="hx-hist__body">
                      <b>{store.serviceById(v.serviceId).short}</b>
                      {v.status === "absent" ? <small>ไม่มารับบริการ</small> : v.diagnoses?.[0] ? <small>{v.diagnoses[0].name}</small> : <small>{stageMeta(v).label}</small>}
                    </span>
                    {v.status === "done" && v.painAfter !== undefined && <PainMini score={v.painAfter} label="หลัง" />}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="pd2__muted">ยังไม่มีประวัติ</p>
            )}
          </section>
        </div>
      </motion.div>
      <CoursePlanDialog key="cpd" patientId={planFor} onClose={() => setPlanFor(null)} />
    </AnimatePresence>
  );
}
