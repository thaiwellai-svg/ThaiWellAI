import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { CreditCard, X } from "lucide-react";
import { CardReader3D, type ReaderState } from "./CardReader3D";
import "./card-reader.css";

/** what a Thai ID card gives us */
export interface IdCardData {
  title: string;
  first: string;
  last: string;
  gender: "ชาย" | "หญิง";
  dob: string; // ISO
  cid: string; // 13 digits
  address: string;
  issued: string;
  expires: string;
}

const LABEL: Record<ReaderState, string> = { checking: "กำลังตรวจสอบเครื่องอ่าน", ready: "เครื่องพร้อมใช้งาน", missing: "ไม่พบเครื่องอ่านบัตร", reading: "กำลังอ่านบัตร" };
const TELL: Record<ReaderState, { title: string; detail: string }> = {
  checking: { title: "กำลังตรวจสอบเครื่องอ่านบัตร", detail: "รอสักครู่ ระบบกำลังเชื่อมต่อกับเครื่องอ่าน" },
  ready: { title: "กรุณาเสียบบัตรประชาชนเข้ากับเครื่องอ่าน", detail: "ให้ด้านที่มีชิปหันขึ้น แล้วดันเข้าจนสุด" },
  missing: { title: "ไม่พบเครื่องอ่านบัตร", detail: "ตรวจสอบว่าเสียบสายเครื่องอ่านกับอุปกรณ์แล้ว จากนั้นลองใหม่" },
  reading: { title: "กำลังอ่านข้อมูลจากบัตร", detail: "อย่าดึงบัตรออกจนกว่าจะอ่านเสร็จ" },
};
const DOT: Record<ReaderState, string> = { checking: "#d97706", ready: "#2f8a52", missing: "#c2482b", reading: "#3b82f6" };

/* ── demo reader (a browser on iPad can't talk to a USB smart-card reader; see README) ── */
const NAMES = [
  ["นาย", "ชาย", "ธนพล", "ศรีสวัสดิ์"],
  ["นางสาว", "หญิง", "กมลชนก", "ธนะสิทธิ์"],
  ["นาง", "หญิง", "วิไลวรรณ", "พงษ์ไพบูลย์"],
  ["นาย", "ชาย", "อนุชา", "แก้วประเสริฐ"],
  ["นางสาว", "หญิง", "ปิยะนุช", "บุญมา"],
] as const;
const ADDR = ["99/1 หมู่ 4 ต.คอหงส์ อ.หาดใหญ่ จ.สงขลา", "12 ถ.ราษฎร์อุทิศ ต.หาดใหญ่ อ.หาดใหญ่ จ.สงขลา", "45/7 หมู่ 2 ต.ทุ่งตำเสา อ.หาดใหญ่ จ.สงขลา"];
function demoCid() {
  const d = [1, ...Array.from({ length: 11 }, () => Math.floor(Math.random() * 10))];
  const sum = d.reduce((n, x, i) => n + x * (13 - i), 0);
  return d.join("") + ((11 - (sum % 11)) % 10);
}
function demoCard(): IdCardData {
  const [title, gender, first, last] = NAMES[Math.floor(Math.random() * NAMES.length)];
  const y = 1960 + Math.floor(Math.random() * 40);
  const m = 1 + Math.floor(Math.random() * 12);
  const d = 1 + Math.floor(Math.random() * 28);
  const iso = (yy: number) => `${yy}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const now = new Date().getFullYear();
  return { title, gender, first, last, dob: iso(y), cid: demoCid(), address: ADDR[Math.floor(Math.random() * ADDR.length)], issued: iso(now - 2), expires: iso(now + 6) };
}
const checkReader = (): Promise<ReaderState> => new Promise((r) => setTimeout(() => r("ready"), 900));
const readCard = (): Promise<IdCardData> => new Promise((r) => setTimeout(() => r(demoCard()), 1600));

/** halo of dots behind the reader, brightening toward where the light comes from */
function Halo({ size, ink }: { size: number; ink: string }) {
  const rings = 6;
  const gap = 18;
  const dots: { x: number; y: number; r: number; o: number }[] = [];
  for (let k = 1; k <= rings; k++) {
    const rad = 70 + k * gap;
    const n = Math.round((2 * Math.PI * rad) / 16);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      dots.push({ x: size / 2 + Math.cos(a) * rad, y: size / 2 + Math.sin(a) * rad, r: 2.2 - k * 0.2, o: 0.55 - k * 0.07 });
    }
  }
  return (
    <svg className="crd__halo" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={ink} opacity={d.o} />
      ))}
    </svg>
  );
}

/** "อ่านจากบัตรประชาชน" — the AtlasHomeCareRN card-reader page, as a sheet */
export function CardReaderDialog({ open, onClose, onRead }: { open: boolean; onClose: () => void; onRead: (d: IdCardData) => void }) {
  const [state, setState] = useState<ReaderState>("checking");
  const tilt = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!open) return;
    setState("checking");
    let live = true;
    checkReader().then((s) => live && setState(s));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      live = false;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const insert = () => {
    setState("reading");
    readCard().then((d) => {
      onRead(d);
      onClose();
    });
  };
  const tell = TELL[state];
  const busy = state === "checking" || state === "reading";

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="crd" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            className="crd__sheet"
            role="dialog"
            aria-modal="true"
            initial={{ y: 30, scale: 0.97, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ type: "spring", stiffness: 340, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="crd__head">
              <span className="crd__icon">
                <CreditCard size={16} />
              </span>
              <b>อ่านข้อมูลจากบัตรประชาชน</b>
              <button type="button" className="crd__x" onClick={onClose} aria-label="ปิด">
                <X size={18} />
              </button>
            </header>

            <div
              className="crd__stage"
              onPointerMove={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                tilt.current = { x: ((e.clientX - r.left) / r.width - 0.5) * 2, y: ((e.clientY - r.top) / r.height - 0.5) * 2 };
              }}
              onPointerLeave={() => (tilt.current = { x: 0, y: 0 })}
            >
              <Halo size={340} ink={DOT[state] === DOT.missing ? DOT.missing : "#4c845a"} />
              <CardReader3D state={state} tilt={tilt} width={340} height={420} />
            </div>

            <div className="crd__text">
              <b>{tell.title}</b>
              <small>{tell.detail}</small>
              <span className="crd__pill" style={{ ["--c" as string]: DOT[state] }}>
                <i />
                {LABEL[state]}
              </span>
            </div>

            <footer className="crd__foot">
              <button type="button" className="crd__btn" onClick={onClose}>
                ยกเลิก
              </button>
              <button
                type="button"
                className="crd__btn is-primary"
                disabled={busy}
                onClick={
                  state === "missing"
                    ? () => {
                        setState("checking");
                        checkReader().then(setState);
                      }
                    : insert
                }
              >
                {state === "missing" ? "ตรวจสอบอีกครั้ง" : state === "reading" ? "กำลังอ่านบัตร…" : "เสียบบัตรแล้ว"}
              </button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
