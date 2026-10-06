import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, Plus, Sparkles, Star, Stethoscope, X } from "lucide-react";
import { clsx } from "clsx";
import { useStore } from "../store/store";
import { useToast } from "../design-system";
import { elementProfile } from "../data/elements";
import type { Appointment, Diagnosis, Procedure } from "../data/types";
import { THAI_MASSAGE_KNOWLEDGE, chatJSON } from "./ai";
import { dxCode, procCode } from "../data/codes";
import "./clinical.css";

/** common Thai-traditional-medicine findings for quick picking (code is filled by the clinic's coder) */
export const DX_PICK = [
  "ลมปลายปัตคาด (ปวดกล้ามเนื้อคอ บ่า ไหล่)",
  "ลมปลายปัตคาดสัญญาณ 4 หลัง (ปวดหลังส่วนล่าง)",
  "ลมจับโปงแห้งเข่า (ข้อเข่าเสื่อม)",
  "สัณฑฆาต / ปวดศีรษะจากลม",
  "ไหล่ติด",
  "อัมพฤกษ์ อัมพาต",
  "ตะคริว",
  "นอนไม่หลับ / เครียดสะสม",
];
export const PROC_PICK = [
  "นวดไทยเพื่อการรักษา",
  "นวดไทยเพื่อสุขภาพ",
  "ประคบสมุนไพร",
  "อบไอน้ำสมุนไพร",
  "นวดเท้าเพื่อสุขภาพ",
  "กดจุดเส้นประธานสิบ",
  "สอนท่าฤาษีดัดตน",
  "พอกสมุนไพร",
];

/** อาการที่ตรวจพบ — free text, shared with the treatment assistant (appointment.findings) */
export function FindingsField({ appt, n = 1 }: { appt: Appointment; n?: number }) {
  const store = useStore();
  const [v, setV] = useState(appt.findings ?? "");
  // the assistant may fill it while the form is open
  useEffect(() => setV(appt.findings ?? ""), [appt.findings]);
  const save = () => {
    const t = v.trim();
    if (t !== (appt.findings ?? "")) store.dispatch({ type: "updateAppointment", id: appt.id, patch: { findings: t || undefined }, log: "บันทึกอาการที่ตรวจพบ" });
  };
  const QUICK = ["ตึง", "กดเจ็บ", "ปวดร้าว", "ชา", "ข้อติด", "บวม"];
  return (
    <RecSection n={n} title="อาการที่ตรวจพบ" hint="ตำแหน่งและลักษณะอาการวันนี้" done={!!(appt.findings ?? "").trim()}>
      <textarea className="cr__findings" rows={2} value={v} onChange={(e) => setV(e.target.value)} onBlur={save} placeholder="เช่น บ่าขวาตึง กดเจ็บ ยกแขนลำบาก" aria-label="อาการที่ตรวจพบ" />
      <div className="cr__chips">
        {QUICK.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => {
              const t = v.trim() ? `${v.trim()} ${q}` : q;
              setV(t);
              store.dispatch({ type: "updateAppointment", id: appt.id, patch: { findings: t }, log: "บันทึกอาการที่ตรวจพบ" });
            }}
          >
            {q}
          </button>
        ))}
      </div>
    </RecSection>
  );
}

/** numbered block of the treatment record — number turns into a check when done */
export function RecSection({ n, title, hint, done, action, children }: { n: number; title: string; hint?: ReactNode; done?: boolean; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rs">
      <div className="rs__head">
        <span className={clsx("rs__num", done && "is-done")}>{done ? <Check size={13} strokeWidth={3} /> : n}</span>
        <b>{title}</b>
        {hint && <small>{hint}</small>}
        {action}
      </div>
      {children}
    </section>
  );
}

/** วินิจฉัย + หัตถการ for one visit — editable while the visit is open, read-only once paid. */
export function ClinicalRecord({ appt, locked, embedded }: { appt: Appointment; locked?: boolean; embedded?: boolean }) {
  const store = useStore();
  const toast = useToast();
  const [adding, setAdding] = useState<"dx" | "proc" | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [codeAt, setCodeAt] = useState<string | null>(null);
  const [openProc, setOpenProc] = useState<string | null>(null);
  const [more, setMore] = useState<"dx" | "proc" | null>(null);
  const dx = appt.diagnoses ?? [];
  const pr = appt.procedures ?? [];
  const s = store.serviceById(appt.serviceId);

  const save = (patch: Partial<Appointment>, log?: string) => store.dispatch({ type: "updateAppointment", id: appt.id, patch, log });
  const addDx = (name: string) => {
    if (!name.trim() || dx.some((d) => d.name === name)) return;
    save({ diagnoses: [...dx, { name: name.trim(), code: dxCode(name.trim())?.code, kind: dx.length ? "secondary" : "principal" }] }, `ลงวินิจฉัย: ${name.trim()}`);
  };
  const addProc = (name: string) => {
    if (!name.trim() || pr.some((p) => p.name === name)) return;
    save({ procedures: [...pr, { name: name.trim(), code: procCode(name.trim())?.code, minutes: pr.length ? undefined : s.minutes }] }, `บันทึกหัตถการ: ${name.trim()}`);
  };
  const setDx = (i: number, patch: Partial<Diagnosis>) => save({ diagnoses: dx.map((d, k) => (k === i ? { ...d, ...patch } : patch.kind === "principal" ? { ...d, kind: "secondary" } : d)) });
  const setPr = (i: number, patch: Partial<Procedure>) => save({ procedures: pr.map((p, k) => (k === i ? { ...p, ...patch } : p)) });

  // fill codes left empty on older records (an explicitly cleared code is "" and stays cleared)
  useEffect(() => {
    if (locked) return;
    const needDx = dx.some((d) => d.code === undefined && dxCode(d.name));
    const needPr = pr.some((p) => p.code === undefined && procCode(p.name));
    if (!needDx && !needPr) return;
    store.dispatch({
      type: "updateAppointment",
      id: appt.id,
      patch: {
        diagnoses: dx.map((d) => (d.code === undefined ? { ...d, code: dxCode(d.name)?.code } : d)),
        procedures: pr.map((p) => (p.code === undefined ? { ...p, code: procCode(p.name)?.code } : p)),
      },
    });
  }, [appt.id, dx, pr, locked, store]);

  const suggest = async () => {
    setBusy(true);
    try {
      const p = store.patientById(appt.patientId);
      const el = elementProfile(p);
      const res = await chatJSON<{ diagnoses: string[]; procedures: { name: string; area?: string }[] }>(
        `คุณช่วยแพทย์แผนไทยลงบันทึกเวชระเบียน ตอบ JSON เท่านั้น: {"diagnoses":["การวินิจฉัยแผนไทย (ภาษาไทย ระบุอาการ/ลม/เส้น)"],"procedures":[{"name":"หัตถการ","area":"ตำแหน่ง/เส้นประธาน"}]} ไม่เกิน 3 รายการต่อหมวด ไม่ต้องใส่รหัส\n${THAI_MASSAGE_KNOWLEDGE}`,
        JSON.stringify({ อาการสำคัญ: p.complaint, โรคประจำตัว: p.conditions, ธาตุเจ้าเรือน: el.birth, บริการวันนี้: s.name, painก่อน: appt.painBefore, painหลัง: appt.painAfter }),
      );
      const ndx = [...dx];
      for (const n of res.diagnoses ?? []) if (!ndx.some((d) => d.name === n)) ndx.push({ name: n, code: dxCode(n)?.code, kind: ndx.length ? "secondary" : "principal" });
      const npr = [...pr];
      for (const x of res.procedures ?? []) if (!npr.some((q) => q.name === x.name)) npr.push({ name: x.name, code: procCode(x.name)?.code, area: x.area, minutes: npr.length ? undefined : s.minutes });
      save({ diagnoses: ndx, procedures: npr }, "AI แนะนำวินิจฉัยและหัตถการ");
      toast({ message: "AI เติมคำแนะนำแล้ว · ตรวจสอบก่อนยืนยัน" });
    } catch {
      toast({ message: "AI แนะนำไม่สำเร็จ ลองใหม่อีกครั้ง", tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const AREAS = ["ศีรษะ", "คอ", "บ่า", "ไหล่", "แขน", "หลังส่วนบน", "หลังส่วนล่าง", "สะโพก", "ขา", "เข่า", "เท้า"];
  const MINS = [15, 30, 45, 60, 90];
  const dxDone = dx.length > 0;
  const prDone = pr.length > 0;

  const suggestBox = (kind: "dx" | "proc") => {
    const pool = kind === "dx" ? DX_PICK.filter((n) => !dx.some((d) => d.name === n)) : PROC_PICK.filter((n) => !pr.some((p) => p.name === n));
    const q = adding === kind ? draft.trim() : "";
    const list = q ? pool.filter((n) => n.includes(q)) : pool;
    const add = kind === "dx" ? addDx : addProc;
    return (
      <div className="cr__add">
        <form
          className="cr__search"
          onSubmit={(e) => {
            e.preventDefault();
            if (q) add(q);
            setDraft("");
          }}
        >
          <Plus size={16} />
          <input
            value={adding === kind ? draft : ""}
            onFocus={() => setAdding(kind)}
            onChange={(e) => {
              setAdding(kind);
              setDraft(e.target.value);
            }}
            placeholder={kind === "dx" ? "พิมพ์หรือเลือกการวินิจฉัย…" : "พิมพ์หรือเลือกหัตถการ…"}
          />
          {q && <button type="submit">เพิ่ม “{q}”</button>}
        </form>
        <div className="cr__chips">
          {list.slice(0, adding === kind ? 8 : 3).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => {
                add(n);
                setDraft("");
                setMore(null);
              }}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    );
  };

  // once something is chosen, the search + suggestions fold into a small link
  const addMore = (kind: "dx" | "proc", label: string) => (
    <button
      type="button"
      className="cr__more"
      onClick={() => {
        setMore(kind);
        setAdding(kind);
      }}
    >
      {label}
    </button>
  );

  const aiBtn = !locked && (
    <button type="button" className="cr__ai" disabled={busy} onClick={suggest} aria-label="ให้ AI ช่วยกรอกวินิจฉัยและหัตถการ" title="ให้ AI ช่วยกรอกวินิจฉัยและหัตถการ">
      {busy ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}
    </button>
  );

  const dxBlock = (
    <>
      <AnimatePresence initial={false}>
        {dx.map((d, i) => (
          <motion.div key={d.name} className={clsx("cr__item", d.kind === "principal" && "is-main")} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 30 }}>
            <button type="button" className="cr__star" disabled={locked} aria-label="ตั้งเป็นวินิจฉัยหลัก" title="ตั้งเป็นวินิจฉัยหลัก" onClick={() => setDx(i, { kind: "principal" })}>
              <Star size={15} fill={d.kind === "principal" ? "currentColor" : "none"} />
            </button>
            <div className="cr__item-main is-compact">
              <b>{d.name}</b>
              {codeAt === `dx${i}` ? (
                <input className="cr__codein" autoFocus value={d.code ?? ""} placeholder="ICD-10" onChange={(e) => setDx(i, { code: e.target.value.toUpperCase() })} onBlur={() => setCodeAt(null)} aria-label="รหัส ICD-10" />
              ) : (
                <button type="button" className="cr__tag" disabled={locked} onClick={() => setCodeAt(`dx${i}`)} title="แตะเพื่อแก้รหัส ICD-10">
                  {d.code || "+ รหัส"}
                </button>
              )}
            </div>
            {!locked && (
              <button type="button" className="cr__del" aria-label="ลบ" onClick={() => save({ diagnoses: dx.filter((_, k) => k !== i).map((x, k) => (k === 0 ? { ...x, kind: "principal" } : x)) })}>
                <X size={15} />
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
      {!locked && (dx.length && more !== "dx" ? addMore("dx", "+ เพิ่มวินิจฉัยร่วม") : suggestBox("dx"))}
      {locked && !dxDone && <p className="cr__empty">ไม่ได้ลงวินิจฉัย</p>}
    </>
  );

  const prBlock = (
    <>
      <AnimatePresence initial={false}>
        {pr.map((p, i) => {
          const areas = (p.area ?? "").split(/[,·]\s*/).map((x) => x.trim()).filter(Boolean);
          const toggleArea = (a: string) => setPr(i, { area: (areas.includes(a) ? areas.filter((x) => x !== a) : [...areas, a]).join(", ") });
          // details stay folded once area + time are set
          const open = !locked && (openProc === p.name || !areas.length || !p.minutes);
          return (
            <motion.div key={p.name} className="cr__proc" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 30 }}>
              <div className="cr__proc-top">
                <div className="cr__item-main is-compact">
                  <b>{p.name}</b>
                  <small className="cr__sumline">{[areas.join(", "), p.minutes ? `${p.minutes} นาที` : ""].filter(Boolean).join(" · ") || "ยังไม่ระบุตำแหน่ง / เวลา"}</small>
                </div>
                {!locked && (
                  <button type="button" className="cr__edit" onClick={() => setOpenProc(open ? null : p.name)}>
                    {open ? "เสร็จ" : "แก้"}
                  </button>
                )}
                {!locked && (
                  <button type="button" className="cr__del" aria-label="ลบ" onClick={() => save({ procedures: pr.filter((_, k) => k !== i) })}>
                    <X size={15} />
                  </button>
                )}
              </div>
              {open && (
                <>
              <div className="cr__field">
                <span>ตำแหน่ง</span>
                <div className="cr__toggles">
                  {[...AREAS, ...areas.filter((a) => !AREAS.includes(a))].map((a) => (
                    <button key={a} type="button" aria-pressed={areas.includes(a)} disabled={locked} onClick={() => toggleArea(a)}>
                      {a}
                    </button>
                  ))}
                </div>
              </div>
              <div className="cr__field">
                <span>เวลา</span>
                <div className="cr__toggles">
                  {MINS.map((m) => (
                    <button key={m} type="button" aria-pressed={p.minutes === m} disabled={locked} onClick={() => setPr(i, { minutes: p.minutes === m ? undefined : m })}>
                      {m} นาที
                    </button>
                  ))}
                </div>
              </div>
                </>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
      {!locked && (pr.length && more !== "proc" ? addMore("proc", "+ เพิ่มหัตถการ") : suggestBox("proc"))}
      {locked && !prDone && <p className="cr__empty">ไม่ได้บันทึกหัตถการ</p>}
    </>
  );

  if (embedded)
    return (
      <>
        <RecSection n={2} title="การวินิจฉัย" done={dxDone} action={aiBtn}>
          {dxBlock}
        </RecSection>
        <RecSection n={3} title="หัตถการ" done={prDone}>
          {prBlock}
        </RecSection>
      </>
    );

  return (
    <section className={clsx("cr", locked && "is-locked")}>
      <div className="cr__head">
        <h3>
          <Stethoscope size={16} /> บันทึกการรักษา
        </h3>
        <span className="cr__progress">
          <i className={clsx(dxDone && "on")} />
          <i className={clsx(prDone && "on")} />
          {dxDone && prDone ? "ครบแล้ว" : `${Number(dxDone) + Number(prDone)}/2`}
        </span>
        {aiBtn}
      </div>
      <RecSection n={1} title="การวินิจฉัย" done={dxDone}>
        {dxBlock}
      </RecSection>
      <RecSection n={2} title="หัตถการ" done={prDone}>
        {prBlock}
      </RecSection>
    </section>
  );
}
