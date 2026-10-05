import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Sparkles, X } from "lucide-react";
import "./tour.css";

/** quick first-login guide: a spotlight walks over the main menu with one line about each page */
const STEPS: { target?: string; title: string; body: string }[] = [
  { title: "ยินดีต้อนรับสู่ ThaiWell", body: "แนะนำเมนูหลักแบบเร็ว ๆ ใช้เวลาไม่ถึง 1 นาที · ข้ามได้ตลอด และเปิดดูอีกครั้งได้ที่หน้าตั้งค่า" },
  { target: '.dock__link[aria-label="หน้าหลัก"]', title: "หน้าหลัก", body: "ภาพรวมวันนี้ · คิว รายได้ เครดิตคอร์ส และคำขอจองคิวจากแอปผู้ป่วยที่รออนุมัติ" },
  { target: '.dock__link[aria-label="รับบริการ"]', title: "รับบริการ", body: "ทำงานหน้างานทีละขั้น · เรียกคิว → คัดกรองก่อนนวด → เริ่มนวด → บันทึกการรักษา → รับชำระเงิน" },
  { target: '.dock__link[aria-label="ผู้มารับบริการ"]', title: "ผู้มารับบริการ", body: "ลงทะเบียนด้วยบัตรประชาชน · ดูประวัติ หุ่น 3D จุดที่ปวด ธาตุเจ้าเรือน และแผนการรักษาโดย AI" },
  { target: '.dock__link[aria-label="ตารางนัด"]', title: "ตารางนัด", body: "ดูนัดรายวันและรายสัปดาห์ · จองนัดใหม่และนัดตามคอร์สการรักษา" },
  { target: '.dock__link[aria-label="คิดเงิน"]', title: "คิดเงิน", body: "ใบเสร็จ ยอดรับชำระ พร้อมเพย์ และการคืนเงิน · ส่งออกรายงานได้" },
  { target: '.dock__link[aria-label="จัดตารางงาน"]', title: "จัดตารางงาน", body: "ตารางผู้บำบัด ห้อง และเตียง · กำหนดวันเวลาทำงานของแต่ละคน" },
  { target: '.dock__link[aria-label="ตั้งค่า"]', title: "ตั้งค่า", body: "ข้อมูลคลินิก บริการและราคา กฎคัดกรอง สำรองข้อมูล · และเปิดคู่มือนี้อีกครั้ง" },
  { target: ".dock__ai", title: "ผู้ช่วย AI", body: "ถามได้ทุกเรื่อง เช่น “วันนี้มีคิวกี่คน” หรือ “สรุปอาการคุณพิมพ์ชนก”" },
  { title: "พร้อมใช้งานแล้ว", body: "เคล็ดลับ: บนหุ่น 3D แตะ = จุดที่ปวด · กดค้าง = ห้ามนวด · จุด ••• บนกล่องใช้จัดตำแหน่งและขยายเต็มจอ" },
];

const KEY = "thaiwell.tour.done";
export const TOUR_EVENT = "thaiwell:tour";
export const startTour = () => window.dispatchEvent(new Event(TOUR_EVENT));

type Box = { x: number; y: number; w: number; h: number };

export function Tour() {
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);

  // first sign-in on this device: show once the dock has slid in
  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(KEY) === "1";
    } catch {
      /* ignore */
    }
    const t = seen ? 0 : window.setTimeout(() => setOpen(true), 1400);
    const replay = () => {
      setI(0);
      setOpen(true);
    };
    window.addEventListener(TOUR_EVENT, replay);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener(TOUR_EVENT, replay);
    };
  }, []);

  const step = STEPS[i];
  const measure = useCallback(() => {
    const el = step.target ? document.querySelector(step.target) : null;
    if (!el) return setBox(null);
    const r = el.getBoundingClientRect();
    const pad = 8;
    setBox({ x: r.left - pad, y: r.top - pad, w: r.width + pad * 2, h: r.height + pad * 2 });
  }, [step.target]);
  useLayoutEffect(() => {
    if (!open) return;
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open, measure]);

  const close = () => {
    setOpen(false);
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
  };
  const next = () => (i < STEPS.length - 1 ? setI(i + 1) : close());
  const back = () => i > 0 && setI(i - 1);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight" || e.key === "Enter") next();
      if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  // card sits above a target in the lower half of the screen, below one in the upper half
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight : 768;
  const cardW = Math.min(340, vw - 32);
  const card = box
    ? {
        left: Math.min(Math.max(box.x + box.w / 2 - cardW / 2, 16), vw - cardW - 16),
        ...(box.y > vh / 2 ? { bottom: vh - box.y + 14 } : { top: box.y + box.h + 14 }),
      }
    : null;
  const last = i === STEPS.length - 1;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="tour" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
          {box ? (
            <motion.div className="tour__hole" initial={false} animate={{ left: box.x, top: box.y, width: box.w, height: box.h }} transition={{ type: "spring", stiffness: 260, damping: 30 }} />
          ) : (
            <div className="tour__dim" />
          )}
          <motion.div
            key={i}
            className={box ? "tour__card" : "tour__card is-center"}
            style={card ? { ...card, width: cardW } : undefined}
            initial={{ opacity: 0, y: box && box.y > vh / 2 ? 10 : -10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            role="dialog"
            aria-label={step.title}
          >
            {!box && (
              <span className="tour__badge">
                {last ? <Check size={22} strokeWidth={2.6} /> : <Sparkles size={22} />}
              </span>
            )}
            <button type="button" className="tour__x" aria-label="ปิดคู่มือ" onClick={close}>
              <X size={16} />
            </button>
            <small className="tour__count">
              {i + 1} / {STEPS.length}
            </small>
            <b>{step.title}</b>
            <p>{step.body}</p>
            <div className="tour__foot">
              <div className="tour__dots">
                {STEPS.map((_, k) => (
                  <i key={k} className={k === i ? "is-on" : k < i ? "is-done" : undefined} />
                ))}
              </div>
              {i > 0 && !last && (
                <button type="button" className="tour__btn is-ghost" onClick={back} aria-label="ย้อนกลับ">
                  <ArrowLeft size={16} />
                </button>
              )}
              {i === 0 && (
                <button type="button" className="tour__btn is-ghost is-text" onClick={close}>
                  ข้าม
                </button>
              )}
              <button type="button" className="tour__btn" onClick={next}>
                {i === 0 ? "เริ่มเลย" : last ? "เริ่มใช้งาน" : "ถัดไป"}
                {!last && <ArrowRight size={15} />}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
