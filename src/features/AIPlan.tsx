import { useEffect, useRef, useState } from "react";
import { intakeOfRequest, intakeOfVisit } from "../data/intake";
import { ElementIcon } from "./ElementIcon";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarPlus, Check, FileText, Leaf, Loader2, Paperclip, RefreshCw, ShieldAlert, Sparkles, Stethoscope, X, TriangleAlert, Hand, Target, Route, Crosshair, House, Printer } from "lucide-react";
import { useStore } from "../store/store";
import { Button, useToast } from "../design-system";
import { ELEMENT_INFO, TH_MONTH, elementProfile } from "../data/elements";
import { addISODays, thaiDate, todayISO } from "../data/thaiDate";
import type { AIPlan, Patient } from "../data/types";
import { AI, THAI_MASSAGE_KNOWLEDGE, chatJSON, ocrFile } from "./ai";
import { CoursePlanDialog } from "../pages/planner/PatientPlanner";
import "./aiplan.css";
import { usePatientPrint } from "./PatientPrint";
import { ThaiMedCard } from "./Samuthan";
import { samuthan } from "../data/samuthan";
import { bestForElement, outcomeRows } from "../data/outcomes";

/** ธาตุเจ้าเรือน · อายุสมุฏฐาน · อุตุสมุฏฐาน of the patient */
export function ElementCard({ p }: { p: Patient }) {
  return <ThaiMedCard p={p} />;
}

const STEPS = ["อ่านประวัติและอาการ", "ประเมินธาตุและเส้น", "เลือกบริการและความถี่", "ตรวจข้อห้าม"];

/** แพทย์อนุมัติร่างแผน → เปิดคอร์สตามแผน (ใช้ทั้งในแผงแผนและการ์ดแผนหน้าผู้ป่วย) */
export function useApprovePlan(p: Patient | undefined) {
  const store = useStore();
  const toast = useToast();
  const plan = p?.aiPlan;
  return () => {
    if (!p || !plan) return;
    const svc = plan.phases[0]?.serviceId ?? "s1";
    const patch: Partial<Patient> = { aiPlan: { ...plan, approved: true } };
    // ครั้งแรกที่มารักษา (ประเมินอาการ + รักษา แล้วแพทย์วางแผน) = ครั้งที่ 1 ของคอร์ส → นัดต่อเฉพาะครั้งที่เหลือ
    //   คอร์สแรก: ครั้งล่าสุดที่รักษาเสร็จ (บริการเดียวกัน · ภายใน 14 วัน) · มีคอร์สเดิมแล้ว: เฉพาะครั้งที่รักษาวันนี้
    const since = p.course ? todayISO() : addISODays(todayISO(), -14);
    // ครั้งแรก = ครั้งล่าสุดที่รักษาแล้วในช่วงนั้น → คอร์สเริ่มนับตั้งแต่วันนั้น (ตัวนับคอร์สนับจากนัดจริง)
    const first = store.appointments
      .filter((a) => a.patientId === p.id && a.serviceId === svc && a.date >= since && a.date <= todayISO() && (a.status === "done" || !!a.endedAt))
      .sort((a, b) => `${b.date}${b.start}`.localeCompare(`${a.date}${a.start}`))[0];
    const firstToday = first ? 1 : 0;
    if (!p.course || p.course.used >= p.course.total)
      patch.course = {
        name: `${store.serviceById(svc).name} ${plan.sessions} ครั้ง`,
        serviceId: svc,
        total: plan.sessions,
        used: Math.min(plan.sessions, firstToday),
        base: 0,
        startedOn: first ? `${first.date}` : todayISO(),
        expiresOn: addISODays(todayISO(), 90),
        // วิธีชำระ (รายครั้ง / ทั้งคอร์สล่วงหน้า) เลือกตอนชำระครั้งแรก
      };
    store.dispatch({ type: "updatePatient", id: p.id, patch });
    // มีนัดล่วงหน้าเกินจำนวนครั้งของคอร์สใหม่ → บอกให้ตรวจ (การ์ดคอร์สมีปุ่มเพิ่มครั้ง / ยกเลิกนัดส่วนเกิน)
    const booked = store.appointments.filter((a) => a.patientId === p.id && a.serviceId === svc && (a.status === "waiting" || a.status === "active") && !a.endedAt && a.date >= todayISO()).length;
    const over = patch.course ? booked - (plan.sessions - patch.course.used) : 0;
    toast({ message: patch.course ? (over > 0 ? `อนุมัติแล้ว · นัดเกินคอร์ส ${over} นัด ดูที่การ์ดคอร์ส` : `อนุมัติแล้ว · เปิดคอร์ส ${plan.sessions} ครั้ง${patch.course.used ? " (นับครั้งแรกแล้ว)" : ""}`) : "อนุมัติแผนแล้ว", tone: over > 0 ? "danger" : undefined });
  };
}

/** AI-drafted treatment plan from the patient's history (+ OCR'd referral documents). */
export function AIPlanCard({ p, panel }: { p: Patient; /** shown as the side panel (no card frame) */ panel?: boolean }) {
  const store = useStore();
  const toast = useToast();
  const [planFor, setPlanFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [reading, setReading] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const plan = p.aiPlan;
  /** ปรับร่างแผนก่อนแพทย์อนุมัติ */
  const editPlan = (patch: Partial<NonNullable<typeof plan>>) => plan && store.dispatch({ type: "updatePatient", id: p.id, patch: { aiPlan: { ...plan, ...patch } } });
  const [print, printNode] = usePatientPrint(p);

  const attach = async (f: File) => {
    setReading(f.name);
    try {
      const text = await ocrFile(f);
      store.dispatch({
        type: "updatePatient",
        id: p.id,
        patch: { documents: [...(p.documents ?? []), { name: f.name, text, at: new Date().toISOString() }] },
      });
      toast({ message: `อ่านเอกสาร ${f.name} แล้ว` });
    } catch {
      toast({ message: "อ่านเอกสารไม่สำเร็จ ลองใหม่", tone: "danger" });
    } finally {
      setReading(null);
    }
  };

  const generate = async () => {
    setBusy(true);
    setError("");
    setStep(0);
    const tick = window.setInterval(() => setStep((s) => Math.min(STEPS.length - 1, s + 1)), 2600);
    try {
      const prof = elementProfile(p);
      const visits = store.appointments
        .filter((a) => a.patientId === p.id && a.status === "done")
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 8)
        .map((a) => ({ date: a.date, service: store.serviceById(a.serviceId).name, painBefore: a.painBefore, painAfter: a.painAfter, advice: a.advice }));
      const req = store.requests.find((r) => r.patientId === p.id);
      const context = {
        patient: { gender: p.gender, age: p.age, complaint: p.complaint, conditions: p.conditions, painHistory: p.painHistory.slice(-8) },
        samuthan: (() => {
          const sm = samuthan(p);
          return { factors: sm.factors.map((f) => `${f.title}: ธาตุ${f.element} (${f.label})`), symptomElements: sm.signs, elementAtRisk: sm.top, guidance: sm.plan };
        })(),
        // real-world outcomes of this clinic for patients with the same birth element (mean pain drop per service)
        clinicEvidence: bestForElement(outcomeRows(store.appointments, store.patients), prof.birth, store.services).map((x) => ({ service: x.service.name, meanPainDrop: +x.mean.toFixed(1), visits: x.n, improvedShare: Math.round(x.improved * 100) + "%" })),
        elements: { birthElement: prof.birth, birthMonth: TH_MONTH[prof.month - 1], ageElement: `${prof.age.element} (${prof.age.label})`, seasonElement: `${prof.season.element} (${prof.season.label})` },
        currentCourse: p.course ? { name: p.course.name, total: p.course.total, used: p.course.used } : null,
        latestScreening: req?.screening,
        // pre-visit self-assessment from the app (pain, areas to focus/avoid, meds, vitals, pressure preference)
        intake: req ? intakeOfRequest(req, p) : (() => {
          const a = store.appointments.filter((x) => x.patientId === p.id && x.type === "booked").sort((x, y) => y.date.localeCompare(x.date))[0];
          return a ? intakeOfVisit(a, p) : null;
        })(),
        recentVisits: visits,
        documents: (p.documents ?? []).map((d) => ({ name: d.name, text: d.text.slice(0, 2500) })),
        services: store.services.map((s) => ({ id: s.id, name: s.name, minutes: s.minutes })),
        clinicRules: { bpThreshold: store.settings.bpThreshold, surgeryRecoveryDays: store.settings.surgeryRecoveryDays, minDaysBetweenSessions: store.settings.minDaysBetweenSessions },
      };
      const system = `คุณคือผู้ช่วยวางแผนการรักษาด้วยการแพทย์แผนไทยสำหรับแพทย์แผนไทยในคลินิก ตอบเป็นภาษาไทย กระชับ อ้างอิงทฤษฎีธาตุและเส้นประธานสิบ
${THAI_MASSAGE_KNOWLEDGE}
ข้อกำหนด: เลือกบริการจากรายการ services เท่านั้น (ใช้ id) · ใช้ samuthan (สมุฏฐานวินิจฉัย 5 ด้าน) ประเมินธาตุที่กำเริบ · ให้น้ำหนักกับ clinicEvidence (ผลจริงของคลินิกกับผู้ป่วยธาตุเดียวกัน) และอ้างตัวเลขใน elementNote ถ้าใช้ · ถ้ามีข้อห้าม ให้ referToDoctor=true และระบุใน precautions · ห้ามวินิจฉัยโรคแผนปัจจุบัน · แผนนี้เป็นร่างให้แพทย์แผนไทยตรวจสอบ
ตอบเป็น JSON เท่านั้น รูปแบบ:
{"summary":"สรุปอาการและเป้าหมาย 1-2 ประโยค","massageType":"นวดเพื่อสุขภาพ"|"นวดเพื่อการรักษา","elementNote":"การประเมินธาตุที่เกี่ยวข้องกับอาการ","goals":["..."],"sessions":จำนวนครั้งรวม,"frequency":"เช่น สัปดาห์ละ 2 ครั้ง","phases":[{"title":"ระยะ","weeks":"สัปดาห์ที่ 1-2","serviceId":"s1","focus":"เส้นประธาน/จุดที่เน้น","technique":"กด คลึง ประคบ ฯลฯ"}],"herbs":["สมุนไพร/ลูกประคบที่เหมาะ"],"homeCare":["ท่าฤาษีดัดตน/การดูแลที่บ้าน"],"precautions":["..."],"referToDoctor":false}`;
      const res = await chatJSON<Omit<AIPlan, "at" | "model">>(system, JSON.stringify(context));
      const valid = new Set(store.services.map((s) => s.id));
      const clean: AIPlan = {
        at: new Date().toISOString(),
        model: AI.model,
        summary: res.summary ?? "",
        massageType: res.massageType === "นวดเพื่อสุขภาพ" ? "นวดเพื่อสุขภาพ" : "นวดเพื่อการรักษา",
        elementNote: res.elementNote ?? "",
        goals: res.goals ?? [],
        sessions: Math.max(1, Math.min(20, Number(res.sessions) || 6)),
        frequency: res.frequency ?? "",
        phases: (res.phases ?? []).map((ph) => ({ ...ph, serviceId: valid.has(ph.serviceId) ? ph.serviceId : store.services[0].id })),
        herbs: res.herbs ?? [],
        homeCare: res.homeCare ?? [],
        precautions: res.precautions ?? [],
        referToDoctor: !!res.referToDoctor,
      };
      store.dispatch({ type: "updatePatient", id: p.id, patch: { aiPlan: clean } });
    } catch (e) {
      setError(e instanceof Error && e.name === "AbortError" ? "" : "AI ตอบไม่สำเร็จ ลองใหม่");
    } finally {
      window.clearInterval(tick);
      setBusy(false);
    }
  };

  // side panel: no plan yet → start analysing straight away (once per patient)
  const started = useRef<string | null>(null);
  useEffect(() => {
    if (!panel || plan || busy || started.current === p.id) return;
    started.current = p.id;
    void generate();
  }, [panel, p.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const approve = useApprovePlan(p);

  return (
    <section className={panel ? "ai-card ai-card--panel" : "pd__card pd__card--wide ai-card"}>
      <div className="pd__card-head">
        <h3 className="ai-title">
          <Sparkles size={16} /> แผนการรักษา AI
        </h3>
        <div className="ai-actions">
          <input ref={file} type="file" accept="application/pdf,image/*" hidden onChange={(e) => e.target.files?.[0] && attach(e.target.files[0])} />
          <Button variant="outline" size="sm" leading={reading ? <Loader2 size={14} className="spin" /> : <Paperclip size={14} />} disabled={!!reading} onClick={() => file.current?.click()}>
            {reading ? "กำลังอ่าน…" : "แนบเอกสาร"}
          </Button>
          <Button size="sm" leading={busy ? <Loader2 size={14} className="spin" /> : plan ? <RefreshCw size={14} /> : <Sparkles size={14} />} disabled={busy} onClick={generate}>
            {busy ? "กำลังวางแผน…" : plan ? "วางแผนใหม่" : "สร้างแผน"}
          </Button>
        </div>
      </div>

      {(p.documents?.length ?? 0) > 0 && (
        <div className="ai-docs">
          {p.documents!.map((d, i) => (
            <span key={i} className="ai-doc" title={d.text.slice(0, 300)}>
              <FileText size={13} /> {d.name}
              <button
                type="button"
                aria-label="ลบเอกสาร"
                onClick={() => store.dispatch({ type: "updatePatient", id: p.id, patch: { documents: p.documents!.filter((_, k) => k !== i) } })}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      <AnimatePresence mode="wait" initial={false}>
        {busy ? (
          <motion.div key="busy" className="ai-busy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <span className="ai-orb" />
            <ol>
              {STEPS.map((s, i) => (
                <li key={s} className={i < step ? "is-done" : i === step ? "is-now" : ""}>
                  {i < step ? <Check size={13} /> : <span />} {s}
                </li>
              ))}
            </ol>
          </motion.div>
        ) : plan ? (
          <motion.div key={plan.at} className="aip" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            {/* overview */}
            <div className="aip-hero">
              <div className="aip-hero__tags">
                <span className={plan.approved ? "aip-status is-ok" : "aip-status"}>
                  {plan.approved ? <Check size={12} strokeWidth={3} /> : <span className="aip-dot" />}
                  {plan.approved ? "แพทย์อนุมัติแล้ว" : "รอแพทย์อนุมัติ"}
                </span>
                <span className="aip-type">{plan.massageType}</span>
              </div>
              <p className="aip-hero__sum">{plan.summary}</p>
              {/* จำนวนครั้ง · ความถี่ · ระยะเวลา — แถวละ 1 เรื่อง (ร่างแผนปรับได้ก่อนแพทย์อนุมัติ) */}
              <dl className="aip-set">
                <div>
                  <dt>จำนวนครั้ง</dt>
                  <dd>
                    {plan.approved ? (
                      <b>{plan.sessions} ครั้ง</b>
                    ) : (
                      <span className="aip-step">
                        <button type="button" aria-label="ลดจำนวนครั้ง" disabled={plan.sessions <= 1} onClick={() => editPlan({ sessions: plan.sessions - 1 })}>
                          −
                        </button>
                        <b>{plan.sessions}</b>
                        <button type="button" aria-label="เพิ่มจำนวนครั้ง" disabled={plan.sessions >= 20} onClick={() => editPlan({ sessions: plan.sessions + 1 })}>
                          +
                        </button>
                        <small>ครั้ง</small>
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>ความถี่ / สัปดาห์</dt>
                  <dd>
                    {plan.approved ? (
                      <b>{plan.frequency || "—"}</b>
                    ) : (
                      <span className="aip-freq" role="radiogroup" aria-label="ความถี่">
                        {[1, 2, 3].map((n) => (
                          <button key={n} type="button" role="radio" aria-checked={plan.frequency === `สัปดาห์ละ ${n} ครั้ง`} aria-pressed={plan.frequency === `สัปดาห์ละ ${n} ครั้ง`} onClick={() => editPlan({ frequency: `สัปดาห์ละ ${n} ครั้ง` })}>
                            {n} ครั้ง
                          </button>
                        ))}
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>ระยะเวลา</dt>
                  <dd>
                    {(() => {
                      const per = Number(/(\d+)/.exec(plan.frequency ?? "")?.[1] ?? 1) || 1;
                      const weeks = Math.ceil(plan.sessions / per);
                      return (
                        <b>
                          ประมาณ {weeks} สัปดาห์ <small>· {plan.phases.length} ระยะ</small>
                        </b>
                      );
                    })()}
                  </dd>
                </div>
              </dl>
            </div>

            {plan.referToDoctor && (
              <div className="aip-refer">
                <ShieldAlert size={18} />
                <div>
                  <b>ควรให้แพทย์ประเมินก่อนเริ่ม</b>
                  <small>ดูข้อควรระวังด้านล่าง</small>
                </div>
              </div>
            )}

            {plan.goals.length > 0 && (
              <section className="aip-sec">
                <h4>
                  <Target size={14} /> เป้าหมาย
                </h4>
                <ul className="aip-goals">
                  {plan.goals.map((g) => (
                    <li key={g}>
                      <i>
                        <Check size={11} strokeWidth={3} />
                      </i>
                      {g}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {plan.phases.length > 0 && (
              <section className="aip-sec">
                <h4>
                  <Route size={14} /> แต่ละระยะ
                </h4>
                <ol className="aip-phases">
                  {plan.phases.map((ph, i) => (
                    <li key={i}>
                      <span className="aip-phases__no">{i + 1}</span>
                      <div className="aip-phases__card">
                        <div className="aip-phases__head">
                          <b>{ph.title}</b>
                          <small>{ph.weeks}</small>
                        </div>
                        <span className="aip-svc">{store.serviceById(ph.serviceId).name}</span>
                        <dl>
                          <div>
                            <dt>
                              <Crosshair size={12} /> เน้น
                            </dt>
                            <dd>{ph.focus}</dd>
                          </div>
                          <div>
                            <dt>
                              <Hand size={12} /> เทคนิค
                            </dt>
                            <dd>{ph.technique}</dd>
                          </div>
                        </dl>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {plan.elementNote &&
              (() => {
                const el = elementProfile(p).birth;
                const info = ELEMENT_INFO[el];
                return (
                  <div className="aip-el" style={{ ["--c" as string]: info.color, ["--t" as string]: info.tint }}>
                    <span>
                      <ElementIcon element={el} size={18} />
                    </span>
                    <div>
                      <small>ธาตุ{el}</small>
                      <p>{plan.elementNote}</p>
                    </div>
                  </div>
                );
              })()}

            {plan.herbs.length > 0 && (
              <section className="aip-sec">
                <h4>
                  <Leaf size={14} /> สมุนไพร / ลูกประคบ
                </h4>
                <div className="aip-herbs">
                  {plan.herbs.map((h) => (
                    <span key={h}>{h}</span>
                  ))}
                </div>
              </section>
            )}

            {plan.homeCare.length > 0 && (
              <section className="aip-sec">
                <h4>
                  <House size={14} /> ดูแลที่บ้าน
                </h4>
                <ul className="aip-list">
                  {plan.homeCare.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </section>
            )}

            {plan.precautions.length > 0 && (
              <section className="aip-sec aip-warn">
                <h4>
                  <TriangleAlert size={14} /> ข้อควรระวัง
                </h4>
                <ul className="aip-list">
                  {plan.precautions.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </section>
            )}

            <div className="aip-foot">
              <small>
                <Sparkles size={12} /> ร่างโดย AI {thaiDate(plan.at.slice(0, 10))} · แพทย์ต้องตรวจก่อนใช้
              </small>
              <div>
                {!plan.approved && (
                  <Button size="md" leading={<Stethoscope size={15} />} onClick={approve}>
                    แพทย์อนุมัติ
                  </Button>
                )}
                {/* นัดลงตามคอร์ส → ต้องอนุมัติแผน (เปิดคอร์ส) ก่อน */}
                <Button variant={plan.approved ? undefined : "outline"} size="md" leading={<CalendarPlus size={15} />} disabled={!plan.approved} title={plan.approved ? undefined : "แพทย์อนุมัติแผนก่อน จึงจองนัดตามคอร์สได้"} onClick={() => setPlanFor(p.id)}>
                  จองนัดตามแผน
                </Button>
              </div>
              <Button variant="outline" size="md" leading={<Printer size={15} />} onClick={print}>
                พิมพ์ / PDF
              </Button>
              {printNode}
            </div>
          </motion.div>
        ) : (
          <motion.div key="empty" className="ai-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Sparkles size={22} />
            <p>
              <b>ยังไม่มีแผน</b>
              AI ร่างแผนจากอาการ ประวัติ ธาตุ และเอกสารที่แนบ
            </p>
            {error && <p className="ai-error">{error}</p>}
          </motion.div>
        )}
      </AnimatePresence>
      {error && plan && <p className="ai-error">{error}</p>}
      <CoursePlanDialog patientId={planFor} onClose={() => setPlanFor(null)} />
    </section>
  );
}

/** compact teaser on the patient page — opens the full AI plan in the side panel */
export function AIPlanTeaser({ p, open, onOpen }: { p: Patient; open: boolean; onOpen: () => void }) {
  const plan = p.aiPlan;
  return (
    <button type="button" className={"pd__card pd__card--wide ai-teaser" + (open ? " is-open" : "")} onClick={onOpen} aria-expanded={open}>
      <span className="ai-teaser__icon">
        <Sparkles size={15} />
      </span>
      <span className="ai-teaser__text">
        <b>
          <i className="pd2__step">1</i> แผนการรักษา
          {plan && <i className={plan.approved ? "is-ok" : undefined}>{plan.approved ? "แพทย์อนุมัติแล้ว" : "รอแพทย์อนุมัติ"}</i>}
        </b>
        <small>{plan ? `${plan.massageType} · ${plan.sessions} ครั้ง` : "AI ร่างแผนจากอาการและประวัติ"}</small>
      </span>
      <em>{open ? "ซ่อน" : plan ? "เปิดแผน" : "สร้างแผน"}</em>
    </button>
  );
}
