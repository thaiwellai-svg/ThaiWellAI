import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ArrowUp, ClipboardList, History, RotateCcw, Search, SquarePen, Trash2, Copy, Leaf, MessageSquareText, PersonStanding, ShieldAlert, ShieldCheck, Square, TrendingUp, X } from "lucide-react";
import { clsx } from "clsx";
import { useStore } from "../../store/store";
import { useToast } from "../../design-system";
import { useInsights } from "../../features/AIAssistant";
import { AIBall } from "../../features/AIBall";
import { THAI_MASSAGE_KNOWLEDGE, chatStream, type ChatMsg } from "../../features/ai";
import { creditInfo, evaluateScreening, stageMeta, staffState } from "../../data/domain";
import { elementProfile } from "../../data/elements";
import { baht, thaiDateLong, todayISO } from "../../data/thaiDate";
import "./assistant.css";
import "./spotlight.css";

const PROMPTS = [
  { icon: ClipboardList, c: "#2f9a6b", title: "สรุปงานวันนี้", text: "สรุปงานวันนี้ให้หน่อย มีอะไรต้องรีบจัดการ" },
  { icon: ShieldAlert, c: "#d0662b", title: "ตรวจข้อห้าม", text: "คำขอจองไหนมีข้อห้าม ควรทำอย่างไร" },
  { icon: PersonStanding, c: "#3a8ee0", title: "ท่าฤาษีดัดตน", text: "แนะนำท่าฤาษีดัดตนสำหรับคนปวดคอบ่าไหล่จากออฟฟิศซินโดรม" },
  { icon: Leaf, c: "#5a9a3a", title: "ธาตุและสมุนไพร", text: "ผู้ป่วยธาตุไฟควรนวดและใช้สมุนไพรอย่างไร" },
  { icon: MessageSquareText, c: "#8b6bff", title: "ร่างข้อความ", text: "ร่างข้อความแจ้งผู้ป่วยเลื่อนนัดเพราะผู้บำบัดลาป่วย" },
  { icon: TrendingUp, c: "#c2862b", title: "วิเคราะห์รายรับ", text: "วิเคราะห์รายรับและการชำระเงินวันนี้" },
];

type Conv = { id: string; title: string; at: string; msgs: ChatMsg[] };
const KEY = "thaiwell.ai.chats";
const OLD_KEY = "thaiwell.ai.chat";
const loadConvs = (): Conv[] => {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "null") as Conv[] | null;
    if (list) return list;
    // migrate the single chat from earlier versions
    const old = JSON.parse(localStorage.getItem(OLD_KEY) ?? "[]") as ChatMsg[];
    const first = old.find((m) => m.role === "user");
    return first ? [{ id: `c${Date.now()}`, title: first.content.slice(0, 60), at: new Date().toISOString(), msgs: old }] : [];
  } catch {
    return [];
  }
};

/** tiny markdown: headings, **bold**, *italic*, bullet / numbered lists (line by line), paragraphs */
function Md({ text }: { text: string }) {
  const clean = text
    .replace(/\$\\?(rightarrow|to)\$/g, "→")
    .replace(/\$\\?(leftarrow)\$/g, "←")
    .replace(/\$([^$\n]{1,20})\$/g, "$1");
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g).map((p, i) =>
      p.startsWith("**") && p.endsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : p.length > 2 && p.startsWith("*") && p.endsWith("*") ? <em key={i}>{p.slice(1, -1)}</em> : p,
    );
  const out: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) out.push(<p key={out.length}>{para.map((l, k) => <span key={k}>{k > 0 && <br />}{inline(l)}</span>)}</p>);
    para = [];
  };
  const flushList = () => {
    if (list) {
      const items = list.items.map((l, k) => (l.startsWith("\u0000") ? <li key={k} className="is-sub">{inline(l.slice(1))}</li> : <li key={k}>{inline(l)}</li>));
      out.push(list.ordered ? <ol key={out.length}>{items}</ol> : <ul key={out.length}>{items}</ul>);
    }
    list = null;
  };
  for (const raw of clean.split("\n")) {
    const line = raw.trimEnd();
    const m = line.match(/^(\s*)([-*•]|\d+[.)])\s+(.*)$/);
    const boldHead = line.trim().match(/^\*\*([^*]+)\*\*:?$/);
    if (!line.trim()) {
      flushPara();
      flushList();
    } else if (/^#{1,4}\s/.test(line) || boldHead) {
      flushPara();
      flushList();
      out.push(<h4 key={out.length}>{boldHead ? boldHead[1].replace(/:$/, "") : inline(line.replace(/^#+\s*/, "").replace(/\*\*/g, ""))}</h4>);
    } else if (m) {
      flushPara();
      const ordered = /\d/.test(m[2]);
      const sub = m[1].length >= 2;
      if (!list || (!sub && list.ordered !== ordered)) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push((sub ? "\u0000" : "") + m[3]);
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return <>{out}</>;
}

/** ผู้ช่วย AI — chat grounded in today's clinic data + Thai traditional medicine knowledge (Gemma on BMS cloud). */
export function AISpotlight({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const insights = useInsights();
  const [convs, setConvs] = useState<Conv[]>(loadConvs);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [histQ, setHistQ] = useState("");
  const openConv = (c: Conv | null) => {
    if (busy) abort.current?.abort();
    setActiveId(c?.id ?? null);
    setMsgs(c?.msgs ?? []);
    setShowHistory(false);
  };
  const removeConv = (id: string) => {
    setConvs((l) => l.filter((c) => c.id !== id));
    if (id === activeId) openConv(null);
  };
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const rec = "idle" as "idle" | "rec" | "asr";
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  // keep the open conversation in the list (new chats get an id + title on the first question)
  useEffect(() => {
    if (!msgs.length) return;
    const first = msgs.find((m) => m.role === "user");
    if (!first) return;
    setConvs((l) => {
      const id = activeId ?? `c${Date.now()}`;
      if (!activeId) setActiveId(id);
      const rest = l.filter((c) => c.id !== id);
      const prev = l.find((c) => c.id === id);
      return [{ id, title: prev?.title ?? first.content.slice(0, 60), at: new Date().toISOString(), msgs: msgs.slice(-40) }, ...rest].slice(0, 30);
    });
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [msgs]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(convs));
      localStorage.removeItem(OLD_KEY);
    } catch {
      /* ignore */
    }
  }, [convs]);

  /** a compact snapshot of the clinic right now, so answers are grounded in real data */
  const context = useMemo(() => {
    const today = todayISO();
    const todays = store.appointments.filter((a) => a.date === today && a.status !== "cancelled").sort((a, b) => a.start.localeCompare(b.start));
    const queue = todays.map((a) => {
      const p = store.patientById(a.patientId);
      return `${a.start} ${p.name} (${p.age}ปี, ธาตุ${elementProfile(p).birth}) ${store.serviceById(a.serviceId).short} กับ ${store.therapistById(a.therapistId).name} — ${stageMeta(a).label}${a.bedId ? ` เตียง ${a.bedId}` : ""}`;
    });
    const reqs = store.requests.map((r) => {
      const p = store.patientById(r.patientId);
      const f = evaluateScreening(r.screening, store.settings);
      return `${p.name} ขอ ${r.date} ${r.start} ${store.serviceById(r.serviceId).short} Pain ${r.painScore}${f.length ? ` ⚠ ${f.map((x) => x.label).join(", ")}` : " ผ่านคัดกรอง"}`;
    });
    const paid = todays.filter((a) => a.payment?.status === "paid");
    const income = paid.reduce((n, a) => n + (a.payment?.amount ?? 0), 0);
    const hour = `${String(new Date().getHours()).padStart(2, "0")}:00`;
    const open = hour >= store.settings.openTime && hour < store.settings.closeTime;
    const staffNow = open
      ? store.therapists.map((t) => {
          const st = staffState(t, { date: today, start: hour, serviceId: t.services[0] ?? "s1" }, store.appointments);
          return `${t.name}: ${st === "free" ? "ว่าง" : st === "busy" ? "ติดคิว" : "ไม่เข้าเวรช่วงนี้"}`;
        })
      : [`นอกเวลาทำการ (${store.settings.openTime}–${store.settings.closeTime})`];
    const low = store.patients.filter((p) => (creditInfo(p, store.appointments)?.remaining ?? 9) <= 1).map((p) => p.name);
    return [
      `วันนี้ ${thaiDateLong(today)} เวลา ${new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น. · ${store.settings.clinicName}`,
      `คิววันนี้ (${queue.length}):\n${queue.join("\n")}`,
      `คำขอจองรออนุมัติ (${reqs.length}):\n${reqs.join("\n")}`,
      `รายรับวันนี้ ${baht(income)} บาท จาก ${paid.length} ใบเสร็จ · ค้างชำระ ${todays.filter((a) => a.status === "done" && !a.paid).length} ราย`,
      `ผู้บำบัดตอนนี้: ${staffNow.join(" · ")}`,
      `เครดิตใกล้หมด: ${low.join(", ") || "ไม่มี"}`,
      `บริการ: ${store.services.map((s) => `${s.name} ${s.minutes}น. ${s.price}บ.`).join(" · ")}`,
    ].join("\n\n");
  }, [store]);

  const ask = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    const history: ChatMsg[] = [...msgs, { role: "user", content: q }];
    setMsgs([...history, { role: "assistant", content: "" }]);
    setBusy(true);
    const ctl = new AbortController();
    abort.current = ctl;
    const system: ChatMsg = {
      role: "system",
      content: `คุณคือ "ผู้ช่วย AI" ของเจ้าหน้าที่คลินิกแพทย์แผนไทย ตอบภาษาไทย สุภาพ กระชับ ใช้สรรพนามผู้หญิง (ลงท้าย ค่ะ/คะ ไม่ใช้ ครับ) ใช้หัวข้อย่อยเมื่อเหมาะ (markdown ธรรมดา ห้ามใช้ LaTeX หรือสัญลักษณ์ $) อ้างอิงข้อมูลคลินิกด้านล่างเมื่อถูกถามเรื่องงานวันนี้ และอ้างอิงศาสตร์แผนไทยเมื่อถูกถามเรื่องการรักษา ห้ามวินิจฉัยโรคแผนปัจจุบัน คำแนะนำการรักษาเป็นข้อเสนอให้แพทย์แผนไทยพิจารณา
${THAI_MASSAGE_KNOWLEDGE}

ข้อมูลคลินิกขณะนี้:
${context}`,
    };
    try {
      await chatStream([system, ...history.slice(-12)], (t) => setMsgs((m) => [...m.slice(0, -1), { role: "assistant", content: m[m.length - 1].content + t }]), ctl.signal);
    } catch (e) {
      if (!(e instanceof Error && e.name === "AbortError"))
        setMsgs((m) => [...m.slice(0, -1), { role: "assistant", content: (m[m.length - 1].content || "") + "\n\n_เชื่อมต่อ AI ไม่สำเร็จ ลองใหม่อีกครั้ง_" }]);
    } finally {
      setBusy(false);
      abort.current = null;
    }
  };

  const colors = { stop: "#c2482b", caution: "#d08a12", info: "#3b82c4", ok: "#2f8a52" };
  const empty = msgs.length === 0;

  const input$ = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => input$.current?.focus(), 250);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  const go = (to: string) => {
    onClose();
    navigate(to);
  };

  const composer = (
    <form
        className={clsx("a3__bar", empty && "is-hero")}
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <textarea
          ref={input$}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask(input);
            }
          }}
          rows={1}
          placeholder="พิมพ์คำถาม…"
        />
        {busy ? (
          <button type="button" className="a3__send" aria-label="หยุด" onClick={() => abort.current?.abort()}>
            <Square size={14} />
          </button>
        ) : (
          <button type="submit" className="a3__send" aria-label="ส่ง" disabled={!input.trim()}>
            <ArrowUp size={18} />
          </button>
        )}
      </form>
  );

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="sl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.18 } }} onClick={onClose}>
          <motion.div className={clsx("sl__wrap", busy && "is-busy")} initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }} onClick={(e) => e.stopPropagation()}>
          {/* light show behind the glass */}
          <span className="sl__aurora" aria-hidden>
            <i />
            <i />
            <i />
            <i />
          </span>
          <span className="sl__halo" aria-hidden />
          <span className="sl__sparks" aria-hidden>
            {Array.from({ length: 14 }, (_, k) => (
              <i key={k} style={{ ["--x" as string]: `${(k * 53) % 100}%`, ["--d" as string]: `${(k * 0.7) % 6}s`, ["--s" as string]: `${3 + (k % 4)}px` }} />
            ))}
          </span>
          <motion.div
            className={clsx("sl__panel a3", !empty && "is-chat")}
            initial={{ opacity: 0, y: -18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.97, transition: { duration: 0.16 } }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            layout
          >
            {/* header */}
            <div className="a3__head">
              <AIBall size={30} busy={busy || rec !== "idle"} />
              <b>ThaiWell AI</b>
              <span className="a3__model" />
              <button type="button" className={clsx("a3__icon", showHistory && "is-on")} onClick={() => setShowHistory((v) => !v)} aria-label="ประวัติแชท" title="ประวัติแชท">
                <History size={16} />
                {convs.length > 0 && <em>{convs.length}</em>}
              </button>
              <button type="button" className="a3__new" onClick={() => openConv(null)} disabled={empty}>
                <SquarePen size={14} /> แชทใหม่
              </button>
              <button type="button" className="a3__icon" onClick={onClose} aria-label="ปิด" title="ปิด (Esc)">
                <X size={16} />
              </button>
            </div>

            <AnimatePresence>
              {showHistory && (
                <>
                  <motion.div className="a3__scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowHistory(false)} />
                  <motion.aside className="a3__hist a5" initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ type: "spring", stiffness: 420, damping: 38 }}>
                    <div className="a5__head">
                      <div>
                        <b>ประวัติแชท</b>
                        <small>{convs.length} บทสนทนา</small>
                      </div>
                      <button type="button" className="a3__icon" onClick={() => setShowHistory(false)} aria-label="ปิดประวัติ">
                        <X size={15} />
                      </button>
                    </div>
                    <button type="button" className="a5__new" onClick={() => openConv(null)}>
                      <SquarePen size={15} /> เริ่มแชทใหม่
                    </button>
                    {convs.length > 3 && (
                      <label className="a5__search">
                        <Search size={14} />
                        <input value={histQ} onChange={(e) => setHistQ(e.target.value)} placeholder="ค้นหาแชท…" />
                      </label>
                    )}
                    <div className="a5__list scroll-y scroll-y--light">
                      {convs.length === 0 && (
                        <div className="a5__empty">
                          <MessageSquareText size={22} />
                          <p>ยังไม่มีแชท</p>
                          <small>แชทที่เคยคุยจะอยู่ที่นี่</small>
                        </div>
                      )}
                      {(() => {
                        const q = histQ.trim();
                        const list = q ? convs.filter((c) => c.title.includes(q) || c.msgs.some((m) => m.content.includes(q))) : convs;
                        if (q && !list.length) return <p className="a5__none">ไม่พบแชทที่ตรงกับ “{q}”</p>;
                        const day = (iso: string) => {
                          const d = Math.floor((new Date(new Date().toDateString()).getTime() - new Date(new Date(iso).toDateString()).getTime()) / 86400000);
                          return d <= 0 ? "วันนี้" : d === 1 ? "เมื่อวาน" : d <= 7 ? "7 วันที่ผ่านมา" : "เก่ากว่านั้น";
                        };
                        const groups: [string, Conv[]][] = [];
                        for (const c of list) {
                          const g = day(c.at);
                          const hit = groups.find(([k]) => k === g);
                          if (hit) hit[1].push(c);
                          else groups.push([g, [c]]);
                        }
                        return groups.map(([g, cs]) => (
                          <div key={g} className="a5__group">
                            <p>{g}</p>
                            {cs.map((c) => {
                              const lastA = [...c.msgs].reverse().find((m) => m.role === "assistant")?.content ?? "";
                              const preview = lastA.replace(/[*#_`>-]/g, "").replace(/\s+/g, " ").trim().slice(0, 90);
                              return (
                                <div key={c.id} className={clsx("a5__item", c.id === activeId && "is-on")}>
                                  <button type="button" onClick={() => openConv(c)}>
                                    <span className="a5__row">
                                      <b>{c.title}</b>
                                      <time>{new Date(c.at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</time>
                                    </span>
                                    {preview && <small>{preview}</small>}
                                    <em>{c.msgs.filter((m) => m.role === "user").length} คำถาม</em>
                                  </button>
                                  <button type="button" className="a5__del" aria-label="ลบแชทนี้" title="ลบ" onClick={() => removeConv(c.id)}>
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        ));
                      })()}
                    </div>
                  </motion.aside>
                </>
              )}
            </AnimatePresence>

            <AnimatePresence mode="wait" initial={false}>
              {empty ? (
                <motion.div key="home" className="a3__home a4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="a4__center">
                    <AIBall size={64} busy={rec !== "idle"} />
                    <h2>
                      สวัสดีค่ะ <span>{store.settings.staffName.replace(/^คุณ/, "")}</span>
                    </h2>
                    <p>วันนี้ให้ช่วยอะไรดีคะ</p>
                    {composer}
                    <div className="a4__chips">
                      {PROMPTS.map((p, i) => (
                        <motion.button key={p.text} type="button" style={{ ["--c" as string]: p.c }} title={p.text} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 + i * 0.03 }} onClick={() => ask(p.text)}>
                          <p.icon size={14} />
                          {p.title}
                        </motion.button>
                      ))}
                    </div>
                  </div>

                  {insights.length > 0 && (
                    <div className="a4__today">
                      <p>วันนี้ที่ควรรู้</p>
                      <div className="a4__tiles">
                        {insights.slice(0, 4).map((i) => (
                          <button key={i.title} type="button" style={{ ["--c" as string]: colors[i.tone] }} onClick={() => (i.to ? go(i.to) : ask(i.title))}>
                            <i />
                            <b>{i.title}</b>
                            <em>
                              {i.cta ?? "ถาม AI"} <ArrowRight size={11} />
                            </em>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div key="chat" className="a3__chat scroll-y scroll-y--light" ref={scroller} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="a3__col">
                    {msgs.map((m, i) => {
                      const last = i === msgs.length - 1;
                      const live = busy && last;
                      return m.role === "user" ? (
                        <motion.div key={i} className="a3__q" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                          <p>{m.content}</p>
                        </motion.div>
                      ) : (
                        <motion.div key={i} className={clsx("a3__a", live && "is-live")} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                          <div className="a3__a-head">
                            <AIBall size={22} busy={live} />
                            <b>ThaiWell AI</b>
                            {live && <small>กำลังคิด…</small>}
                          </div>
                          <div className="a3__a-body">{m.content ? <Md text={m.content} /> : <span className="ai-dots"><i /><i /><i /></span>}</div>
                          {m.content && !live && (
                            <div className="a3__a-tools">
                              <button type="button" onClick={() => (navigator.clipboard?.writeText(m.content), toast({ message: "คัดลอกแล้ว" }))}>
                                <Copy size={13} /> คัดลอก
                              </button>
                              {last && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const q = [...msgs].reverse().find((x) => x.role === "user");
                                    if (!q) return;
                                    setMsgs((l) => l.slice(0, -2));
                                    window.setTimeout(() => ask(q.content), 0);
                                  }}
                                >
                                  <RotateCcw size={13} /> ตอบใหม่
                                </button>
                              )}
                            </div>
                          )}
                        </motion.div>
                      );
                    })}
                    {!busy && msgs[msgs.length - 1]?.role === "assistant" && (
                      <div className="a3__follow">
                        {["สรุปให้สั้นลง", "ทำเป็นข้อความส่งผู้ป่วย", "อะไรต้องทำก่อน"].map((f) => (
                          <button key={f} type="button" onClick={() => ask(f)}>
                            {f}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {!empty && composer}
            <p className="a3__foot">
              <ShieldCheck size={12} /> AI เป็นผู้ช่วย แพทย์แผนไทยเป็นผู้อนุมัติการรักษา
            </p>
          </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
