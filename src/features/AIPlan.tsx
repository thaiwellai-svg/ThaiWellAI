import { useRef, useState } from "react";
import { intakeOfRequest, intakeOfVisit } from "../data/intake";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarPlus, Check, FileText, Leaf, Loader2, Paperclip, RefreshCw, ShieldAlert, Sparkles, Stethoscope, X } from "lucide-react";
import { useStore } from "../store/store";
import { Badge, Button, Select, useToast } from "../design-system";
import { ELEMENT_INFO, TH_MONTH, elementProfile, type Element } from "../data/elements";
import { addISODays, thaiDate, todayISO } from "../data/thaiDate";
import type { AIPlan, Patient } from "../data/types";
import { AI, THAI_MASSAGE_KNOWLEDGE, chatJSON, ocrFile } from "./ai";
import { CoursePlanDialog } from "../pages/planner/PatientPlanner";
import "./aiplan.css";

/** ธาตุเจ้าเรือน · อายุสมุฏฐาน · อุตุสมุฏฐาน of the patient */
export function ElementCard({ p }: { p: Patient }) {
  const store = useStore();
  const prof = elementProfile(p);
  const info = ELEMENT_INFO[prof.birth];
  const chip = (label: string, el: Element, sub: string) => (
    <span className="el-chip" style={{ ["--c" as string]: ELEMENT_INFO[el].color, ["--t" as string]: ELEMENT_INFO[el].tint }}>
      <small>{label}</small>
      <b>ธาตุ{el}</b>
      <i>{sub}</i>
    </span>
  );
  return (
    <section className="pd__card el-card" style={{ ["--c" as string]: info.color, ["--t" as string]: info.tint }}>
      <div className="pd__card-head">
        <h3>ธาตุเจ้าเรือน</h3>
        <label className="el-month">
          เกิดเดือน
          <Select value={prof.month} onChange={(e) => store.dispatch({ type: "updatePatient", id: p.id, patch: { birthMonth: Number(e.target.value) } })}>
            {TH_MONTH.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <div className="el-hero">
        <span className="el-badge">{prof.birth}</span>
        <div>
          <b>ธาตุ{prof.birth}</b>
          <p>{info.trait}</p>
        </div>
      </div>
      <div className="el-chips">
        {chip("อายุสมุฏฐาน", prof.age.element, prof.age.label)}
        {chip("อุตุสมุฏฐาน", prof.season.element, prof.season.label)}
      </div>
      <dl className="el-kv">
        <dt>มักพบ</dt>
        <dd>{info.risk}</dd>
        <dt>รสยาที่เหมาะ</dt>
        <dd>{info.taste}</dd>
        <dt>แนวทางนวด</dt>
        <dd>{info.care}</dd>
      </dl>
    </section>
  );
}

const STEPS = ["อ่านประวัติและอาการ", "ประเมินธาตุและเส้นประธาน", "เลือกบริการและความถี่", "ตรวจข้อห้ามและข้อควรระวัง"];

/** AI-drafted treatment plan from the patient's history (+ OCR'd referral documents). */
export function AIPlanCard({ p }: { p: Patient }) {
  const store = useStore();
  const toast = useToast();
  const [planFor, setPlanFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [reading, setReading] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const plan = p.aiPlan;

  const attach = async (f: File) => {
    setReading(f.name);
    try {
      const text = await ocrFile(f);
      store.dispatch({
        type: "updatePatient",
        id: p.id,
        patch: { documents: [...(p.documents ?? []), { name: f.name, text, at: new Date().toISOString() }] },
      });
      toast({ message: `อ่านเอกสาร ${f.name} แล้ว (${text.length.toLocaleString()} ตัวอักษร)` });
    } catch {
      toast({ message: "อ่านเอกสารไม่สำเร็จ ลองใหม่อีกครั้ง", tone: "danger" });
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
ข้อกำหนด: เลือกบริการจากรายการ services เท่านั้น (ใช้ id) · ถ้ามีข้อห้าม ให้ referToDoctor=true และระบุใน precautions · ห้ามวินิจฉัยโรคแผนปัจจุบัน · แผนนี้เป็นร่างให้แพทย์แผนไทยตรวจสอบ
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
      setError(e instanceof Error && e.name === "AbortError" ? "" : "AI ตอบกลับไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      window.clearInterval(tick);
      setBusy(false);
    }
  };

  const approve = () => {
    if (!plan) return;
    const svc = plan.phases[0]?.serviceId ?? "s1";
    const patch: Partial<Patient> = { aiPlan: { ...plan, approved: true } };
    if (!p.course || p.course.used >= p.course.total)
      patch.course = {
        name: `${store.serviceById(svc).name} ${plan.sessions} ครั้ง`,
        serviceId: svc,
        total: plan.sessions,
        used: 0,
        startedOn: todayISO(),
        expiresOn: addISODays(todayISO(), 90),
      };
    store.dispatch({ type: "updatePatient", id: p.id, patch });
    toast({ message: patch.course ? `อนุมัติแผน · เปิดคอร์ส ${plan.sessions} ครั้งแล้ว` : "อนุมัติแผนแล้ว" });
  };

  return (
    <section className="pd__card pd__card--wide ai-card">
      <div className="pd__card-head">
        <h3 className="ai-title">
          <Sparkles size={16} /> แผนการรักษาแนะนำโดย AI
        </h3>
        <div className="ai-actions">
          <input ref={file} type="file" accept="application/pdf,image/*" hidden onChange={(e) => e.target.files?.[0] && attach(e.target.files[0])} />
          <Button variant="outline" size="sm" leading={reading ? <Loader2 size={14} className="spin" /> : <Paperclip size={14} />} disabled={!!reading} onClick={() => file.current?.click()}>
            {reading ? "กำลังอ่าน…" : "แนบเอกสาร"}
          </Button>
          <Button size="sm" leading={busy ? <Loader2 size={14} className="spin" /> : plan ? <RefreshCw size={14} /> : <Sparkles size={14} />} disabled={busy} onClick={generate}>
            {busy ? "กำลังวางแผน…" : plan ? "วางแผนใหม่" : "ให้ AI วางแผน"}
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
          <motion.div key={plan.at} className="ai-plan" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <div className="ai-top">
              <Badge tone={plan.massageType === "นวดเพื่อการรักษา" ? "info" : "neutral"}>{plan.massageType}</Badge>
              <Badge tone="neutral">
                {plan.sessions} ครั้ง · {plan.frequency}
              </Badge>
              {plan.approved && (
                <Badge tone="success">
                  <Check size={12} /> แพทย์อนุมัติแล้ว
                </Badge>
              )}
            </div>
            <p className="ai-summary">{plan.summary}</p>
            {plan.referToDoctor && (
              <div className="alert alert--stop">
                <ShieldAlert size={16} />
                <div>
                  <b>ควรให้แพทย์แผนไทยประเมินก่อนเริ่มแผน</b>
                  ดูข้อควรระวังด้านล่าง
                </div>
              </div>
            )}
            {plan.elementNote && (
              <p className="ai-element">
                <Leaf size={14} /> {plan.elementNote}
              </p>
            )}
            {plan.goals.length > 0 && (
              <ul className="ai-goals">
                {plan.goals.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            )}
            <ol className="ai-phases">
              {plan.phases.map((ph, i) => (
                <li key={i}>
                  <span className="ai-phase-no">{i + 1}</span>
                  <div>
                    <b>
                      {ph.title} <small>{ph.weeks}</small>
                    </b>
                    <span className="ai-svc">{store.serviceById(ph.serviceId).name}</span>
                    <p>
                      <em>เน้น</em> {ph.focus}
                    </p>
                    <p>
                      <em>เทคนิค</em> {ph.technique}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="ai-cols">
              {plan.herbs.length > 0 && (
                <div>
                  <h4>สมุนไพร / ลูกประคบ</h4>
                  <div className="ai-tags">
                    {plan.herbs.map((h) => (
                      <span key={h}>{h}</span>
                    ))}
                  </div>
                </div>
              )}
              {plan.homeCare.length > 0 && (
                <div>
                  <h4>ดูแลที่บ้าน · ฤาษีดัดตน</h4>
                  <ul>
                    {plan.homeCare.map((h) => (
                      <li key={h}>{h}</li>
                    ))}
                  </ul>
                </div>
              )}
              {plan.precautions.length > 0 && (
                <div className="ai-warn">
                  <h4>ข้อควรระวัง</h4>
                  <ul>
                    {plan.precautions.map((h) => (
                      <li key={h}>{h}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="ai-foot">
              <small>
                ร่างโดย {plan.model} · {thaiDate(plan.at.slice(0, 10))} · ต้องให้แพทย์แผนไทยตรวจสอบก่อนใช้
              </small>
              {!plan.approved && (
                <Button variant="outline" size="md" leading={<Stethoscope size={15} />} onClick={approve}>
                  แพทย์อนุมัติแผน
                </Button>
              )}
              <Button size="md" leading={<CalendarPlus size={15} />} onClick={() => setPlanFor(p.id)}>
                จองนัดตามแผน
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.div key="empty" className="ai-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Sparkles size={22} />
            <p>
              ยังไม่มีแผนการรักษา · AI จะอ่านอาการ ประวัติ Pain Score ธาตุเจ้าเรือน และเอกสารที่แนบ (ใบส่งตัว ผลตรวจ) แล้วร่างแผนนวด ประคบ สมุนไพร และท่าฤาษีดัดตนให้แพทย์ตรวจสอบ
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
