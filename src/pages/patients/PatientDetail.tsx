import { CoursePlanDialog } from "../planner/PatientPlanner";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarPlus, Phone, TrendingDown, TrendingUp } from "lucide-react";
import { useStore } from "../../store/store";
import { Badge, Button, EmptyState, ease } from "../../design-system";
import { stageMeta, creditInfo, painTone } from "../../data/domain";
import { patientPhoto } from "../../data/avatars";
import { relativeDay, thaiDate, thaiDateShort, todayISO } from "../../data/thaiDate";
import { PhotoPicker } from "../../features/PhotoPicker";
import { PainMini } from "../../features/RecordCards";
import { AIPlanCard, ElementCard } from "../../features/AIPlan";
import { painColor } from "../../features/widgets";

/** Donut showing used / booked / free sessions of a treatment plan. */
function CreditRing({ total, used, booked }: { total: number; used: number; booked: number }) {
  const R = 46;
  const C = 2 * Math.PI * R;
  const seg = (n: number) => (n / total) * C;
  const free = Math.max(0, total - used - booked);
  return (
    <div className="ring">
      <svg viewBox="0 0 120 120" width="120" height="120" aria-hidden>
        <circle cx="60" cy="60" r={R} fill="none" stroke="var(--sage-100)" strokeWidth="12" />
        <motion.circle
          cx="60" cy="60" r={R} fill="none" stroke="var(--color-brand)" strokeWidth="12" strokeLinecap="round"
          transform="rotate(-90 60 60)"
          initial={{ strokeDasharray: `0 ${C}` }}
          animate={{ strokeDasharray: `${Math.max(0, seg(used) - 3)} ${C}` }}
          transition={{ duration: 0.8, ease: ease.out }}
        />
        <motion.circle
          cx="60" cy="60" r={R} fill="none" stroke="var(--status-waiting)" strokeWidth="12" strokeLinecap="round"
          transform={`rotate(${-90 + (used / total) * 360} 60 60)`}
          initial={{ strokeDasharray: `0 ${C}` }}
          animate={{ strokeDasharray: `${Math.max(0, seg(booked) - 3)} ${C}` }}
          transition={{ duration: 0.8, delay: 0.2, ease: ease.out }}
        />
      </svg>
      <div className="ring__center">
        <b>{free}</b>
        <small>คงเหลือ</small>
      </div>
    </div>
  );
}

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

export function PatientDetail({ id, onAdd }: { id: string | null; onAdd: () => void }) {
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
          <div className="pd__actions">
            <Button variant="outline" size="md" leading={<Phone size={15} />} onClick={() => (window.location.href = `tel:${p.phone.replace(/-/g, "")}`)}>
              {p.phone}
            </Button>
            <Button size="md" leading={<CalendarPlus size={15} />} onClick={() => setPlanFor(p.id)}>
              จัดตารางงาน
            </Button>
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
          <AIPlanCard p={p} />
          <ElementCard p={p} />
          {/* Plan */}
          <section className="pd__card">
            <h3>แผนการรักษา</h3>
            {credits ? (
              <div className="pd__plan">
                <CreditRing total={credits.total} used={credits.used} booked={credits.booked} />
                <div className="pd__plan-text">
                  <b>{p.course!.name}</b>
                  <p className="tw-meta">
                    ใช้แล้ว {credits.used} · จองไว้ {credits.booked} · คงเหลือ {credits.remaining} จาก {credits.total} ครั้ง
                  </p>
                  <p className="tw-caption">
                    {thaiDate(p.course!.startedOn)} – {thaiDate(p.course!.expiresOn)}
                  </p>
                  {credits.remaining <= 1 && (
                    <Badge tone="danger" compact>
                      เครดิตใกล้หมด · นัดพบแพทย์เพื่อต่อแผน
                    </Badge>
                  )}
                </div>
              </div>
            ) : (
              <p className="tw-meta">ไม่มีแผนการรักษา — รับบริการแบบชำระรายครั้ง</p>
            )}
          </section>

          {/* Complaint */}
          <section className="pd__card">
            <h3>อาการสำคัญ</h3>
            <p className="pd__complaint">{p.complaint}</p>
            {(p.birthDate || p.citizenId || p.emergency) && (
              <dl className="pd__info">
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
                    <dt>ผู้ติดต่อฉุกเฉิน</dt>
                    <dd>
                      {p.emergency.name}
                      {p.emergency.relation ? ` (${p.emergency.relation})` : ""} · {p.emergency.phone}
                    </dd>
                  </div>
                )}
              </dl>
            )}
          </section>

          {/* Pain trend */}
          <section className="pd__card pd__card--wide">
            <div className="pd__card-head">
              <h3>แนวโน้ม Pain Score</h3>
              {first !== undefined && last !== undefined && h.length > 1 && (
                <Badge tone={painTone(last) === "danger" ? "danger" : last < first ? "success" : "warning"} compact>
                  {first} → {last}
                  {last < first ? ` · ดีขึ้น ${Math.round(((first - last) / first) * 100)}%` : ""}
                </Badge>
              )}
            </div>
            {h.length > 1 ? <PainChart points={h} /> : <p className="tw-meta">ยังไม่มีข้อมูลการประเมิน — จะเริ่มบันทึกหลังรับบริการครั้งแรก</p>}
          </section>

          {/* Upcoming */}
          <section className="pd__card">
            <h3>นัดหมายที่จะถึง ({upcoming.length})</h3>
            {upcoming.length ? (
              <ul className="pd__list">
                {upcoming.map((v) => (
                  <li key={v.id}>
                    <span className="pd__date">
                      <b>{thaiDateShort(v.date)}</b>
                      <small>{v.start}</small>
                    </span>
                    <span className="pd__what">
                      {store.serviceById(v.serviceId).name}
                      <small>{store.therapistById(v.therapistId).name}</small>
                    </span>
                    <Badge tone={stageMeta(v).tone} compact dot>
                      {stageMeta(v).label}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="tw-meta">ยังไม่มีนัดหมาย</p>
            )}
          </section>

          {/* History */}
          <section className="pd__card">
            <h3>ประวัติการรับบริการ</h3>
            {past.length ? (
              <ul className="pd__list">
                {past.map((v) => (
                  <li key={v.id}>
                    <span className="pd__date">
                      <b>{thaiDateShort(v.date)}</b>
                      <small>{v.start}</small>
                    </span>
                    <span className="pd__what">
                      {store.serviceById(v.serviceId).short}
                      <small>{stageMeta(v).label}</small>
                    </span>
                    {v.status === "done" && v.painAfter !== undefined ? <PainMini score={v.painAfter} label="หลัง" /> : <span />}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="tw-meta">ยังไม่มีประวัติ</p>
            )}
          </section>
        </div>
      </motion.div>
      <CoursePlanDialog key="cpd" patientId={planFor} onClose={() => setPlanFor(null)} />
    </AnimatePresence>
  );
}
