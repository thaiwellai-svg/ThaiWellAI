import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import QRCode from "qrcode";
import { Check, CheckCheck, FileText, Printer, Send, X, Ban } from "lucide-react";
import { useStore } from "../store/store";
import { useToast } from "../design-system";
import { baht, thaiDateLong } from "../data/thaiDate";
import { METHOD_LABEL, extraLines, usesCredit, visitTotal } from "./billing";
import { useLatest } from "./useLatest";
import { TaxInvoiceDialog } from "./TaxInvoice";
import "./receipt.css";

const EASE = [0.22, 1, 0.36, 1] as const;

/** Payment slip that "prints" down out of a slot; prints on its own via print CSS. */
export function ReceiptDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const shown = useLatest(id);
  const [qr, setQr] = useState("");
  const [run, setRun] = useState(0); // replay key

  // id = "<appointment>" for the current receipt, "<appointment>|<receipt no>" for a cancelled one
  const [apptId, voidNo] = (shown ?? "").split("|");
  const a = store.appointments.find((x) => x.id === apptId);
  const vp = voidNo ? a?.voidedPayments?.find((x) => x.no === voidNo) : undefined;
  const no = (vp ?? a?.payment)?.no ?? (a ? `RC-${a.id.toUpperCase()}` : "");
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState("");
  const [refund, setRefund] = useState(true);
  const [taxFor, setTaxFor] = useState<string | null>(null);
  useEffect(() => {
    if (!no) return;
    QRCode.toDataURL(`thaiwell://receipt/${no}`, { margin: 0, width: 160, color: { dark: "#2a2620", light: "#00000000" } })
      .then(setQr)
      .catch(() => setQr(""));
  }, [no]);
  useEffect(() => {
    if (!id) return;
    setRun((r) => r + 1);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [id, onClose]);

  if (!a) return null;
  const p = store.patientById(a.patientId);
  const s = store.serviceById(a.serviceId);
  const t = store.therapistById(a.therapistId);
  const pay = vp ?? a.payment;
  const isVoid = pay?.status === "void";
  const at = new Date(pay?.at ?? `${a.date}T${a.start}`);
  const credit = usesCredit(pay);
  const total = pay?.amount ?? visitTotal(s, a);
  // รายการ: ค่าบริการ + หัตถการเพิ่ม (ตามที่คิดเงินจริงตอนออกใบเสร็จ)
  const extras = pay?.items ? pay.items.slice(1) : extraLines(a);
  const paid = pay ? pay.status === "paid" : a.paid;

  const send = () => {
    if (pay) store.dispatch({ type: "updateAppointment", id: a.id, patch: { payment: { ...pay, slipSentAt: new Date().toISOString() } }, log: "ส่งสลิปเข้าแอป" });
    toast({ message: `ส่งสลิปไปแอป ThaiWell AI ของ ${p.name} แล้ว` });
  };

  // each line drops in once the paper has come out
  const line = (i: number) => ({
    initial: { opacity: 0, y: -6 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: 0.75 + i * 0.07, duration: 0.35, ease: EASE },
  });

  return createPortal(
    <AnimatePresence>
      {id && (
        <motion.div className="rcx" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.2 } }} onClick={onClose}>
          <div className="rcx__stage" onClick={(e) => e.stopPropagation()}>
            {/* printer slot */}
            <motion.div className="rcx__slot" initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.35, ease: EASE }}>
              <span className="rcx__led" />
              <span className="rcx__mouth" />
              <button type="button" className="rcx__close" aria-label="ปิด" onClick={onClose}>
                <X size={16} />
              </button>
            </motion.div>

            {/* the paper */}
            <div className="rcx__clip">
              <motion.div
                key={run}
                className="rcx__paper"
                id="receipt-print"
                initial={{ y: "-100%" }}
                animate={{ y: 0 }}
                transition={{ duration: 1.1, ease: [0.3, 0.9, 0.3, 1] }}
              >
                <motion.span className={`rcx__stamp ${isVoid ? "is-void" : paid ? "is-paid" : "is-due"}`} initial={{ scale: 2.4, opacity: 0, rotate: -24 }} animate={{ scale: 1, opacity: 1, rotate: -12 }} transition={{ delay: 1.35, type: "spring", stiffness: 380, damping: 16 }}>
                  {isVoid ? (
                    "ยกเลิก"
                  ) : paid ? (
                    <>
                      <Check size={14} strokeWidth={3} /> ชำระแล้ว
                    </>
                  ) : (
                    "รอชำระ"
                  )}
                </motion.span>

                <motion.header className="rcx__head" {...line(0)}>
                  <span className="rcx__logo">
                    <svg viewBox="0 0 64 64" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round">
                      <path d="M32 50 C22 40 22 22 32 10 C42 22 42 40 32 50 Z" />
                      <path d="M32 50 C18 46 10 34 12 20 C24 24 32 36 32 50 Z" />
                      <path d="M32 50 C46 46 54 34 52 20 C40 24 32 36 32 50 Z" />
                      <path d="M14 56 H50" strokeLinecap="round" />
                    </svg>
                  </span>
                  <b>{store.settings.clinicName}</b>
                  <small>ใบเสร็จรับเงิน · RECEIPT</small>
                </motion.header>

                <motion.div className="rcx__amount" {...line(1)}>
                  <small>ยอดชำระ</small>
                  <b>
                    {baht(total)}
                    <span> บาท</span>
                  </b>
                  <i>{pay ? METHOD_LABEL[pay.method] : paid ? "ชำระแล้ว" : "ค้างชำระ"}</i>
                </motion.div>

                <Tear />

                <motion.dl className="rcx__meta" {...line(2)}>
                  <dt>เลขที่</dt>
                  <dd>{no}</dd>
                  <dt>วันที่</dt>
                  <dd>
                    {thaiDateLong(at.toISOString().slice(0, 10)).replace(/^วัน\S+ที่ /, "")} · {at.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.
                  </dd>
                  <dt>ผู้รับบริการ</dt>
                  <dd>
                    {p.name}
                    <small>{p.hn}</small>
                  </dd>
                  <dt>ผู้บำบัด</dt>
                  <dd>{t.name}</dd>
                </motion.dl>

                <Dash />

                <motion.div className="rcx__items" {...line(3)}>
                  <div>
                    <span>
                      {s.name}
                      <small>{s.minutes} นาที × 1</small>
                    </span>
                    <b>{baht(s.price)}</b>
                  </div>
                  {extras.map((l, i) => (
                    <div key={`${l.name}${i}`}>
                      <span>
                        {l.name}
                        <small>หัตถการเพิ่ม</small>
                      </span>
                      <b>{baht(l.amount)}</b>
                    </div>
                  ))}
                  {credit && (
                    <div className="is-credit">
                      <span>
                        หักเครดิต {p.course?.name ?? "คอร์ส"}
                        <small>ใช้สิทธิ์ 1 ครั้ง</small>
                      </span>
                      <b>−{baht(s.price)}</b>
                    </div>
                  )}
                </motion.div>

                <Dash />

                <motion.div className="rcx__sum" {...line(4)}>
                  <div className="rcx__total">
                    <span>รวมทั้งสิ้น</span>
                    <b>{baht(total)} ฿</b>
                  </div>
                  {pay?.method === "cash" && pay.received !== undefined && (
                    <>
                      <div>
                        <span>รับเงิน</span>
                        <b>{baht(pay.received)}</b>
                      </div>
                      <div>
                        <span>เงินทอน</span>
                        <b>{baht(pay.received - pay.amount)}</b>
                      </div>
                    </>
                  )}
                  {pay?.status === "pending" && (
                    <div>
                      <span>สถานะ</span>
                      <b>รอชำระในแอป ThaiWell AI</b>
                    </div>
                  )}
                  {pay?.voided && (
                    <div className="rcx__void">
                      <span>ยกเลิกเมื่อ</span>
                      <b>
                        {new Date(pay.voided.at).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {pay.voided.by}
                      </b>
                      <span>เหตุผล</span>
                      <b>
                        {pay.voided.reason}
                        {pay.voided.refund ? ` · คืนเงิน ${baht(pay.amount)} บาท` : ""}
                      </b>
                    </div>
                  )}
                </motion.div>

                <Tear />

                <motion.footer className="rcx__foot" {...line(5)}>
                  {qr && <img src={qr} alt="" width={64} height={64} />}
                  <p>
                    ขอบคุณที่ใช้บริการ
                    <small>สแกนเพื่อดูใบเสร็จและประวัติการรักษาในแอป ThaiWell AI</small>
                    {pay?.slipSentAt && (
                      <em>
                        <CheckCheck size={12} /> ส่งเข้าแอปแล้ว {new Date(pay.slipSentAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.
                      </em>
                    )}
                  </p>
                </motion.footer>
              </motion.div>
            </div>

            <motion.div className="rcx__actions" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.2, duration: 0.4, ease: EASE }}>
              <button type="button" className="rcx__btn" onClick={send}>
                <Send size={16} /> {pay?.slipSentAt ? "ส่งซ้ำ" : "ส่งเข้าแอป"}
              </button>
              <button type="button" className="rcx__btn" onClick={() => setRun((r) => r + 1)}>
                <Printer size={16} /> พิมพ์ใหม่
              </button>
              <button type="button" className="rcx__btn rcx__btn--primary" onClick={() => window.print()}>
                <Printer size={16} /> พิมพ์สลิป
              </button>
              {store.settings.vat?.registered && !vp && pay?.status === "paid" && pay.method !== "credit" && pay.amount > 0 && (
                <button type="button" className="rcx__btn" onClick={() => setTaxFor(a.id)}>
                  <FileText size={16} /> {pay.taxInvoice ? "ใบกำกับภาษี" : "ออกใบกำกับภาษี"}
                </button>
              )}
              {!isVoid && pay && pay.status !== "void" && (
                <button type="button" className="rcx__btn rcx__btn--danger" onClick={() => setVoiding(true)}>
                  <Ban size={16} /> ยกเลิกใบเสร็จ
                </button>
              )}
            </motion.div>
            <AnimatePresence>
              {voiding && pay && (
                <motion.div className="rcx__voidbox" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
                  <b>ยกเลิกใบเสร็จ {pay.no}</b>
                  <small>ใบเสร็จเดิมจะขึ้นตรา “ยกเลิก” และยังเก็บไว้ในประวัติ · รายการกลับไปรอชำระเงินใหม่{pay.method === "credit" ? " · คืนเครดิตคอร์ส 1 ครั้ง" : ""}</small>
                  <div className="rcx__reasons">
                    {["ออกใบเสร็จผิดคน", "ยอดเงินไม่ถูกต้อง", "เลือกช่องทางผิด", "ผู้ป่วยขอคืนเงิน"].map((r) => (
                      <button key={r} type="button" aria-pressed={reason === r} onClick={() => setReason(r)}>
                        {r}
                      </button>
                    ))}
                  </div>
                  <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="หรือพิมพ์เหตุผล…" />
                  {pay.method !== "credit" && pay.amount > 0 && (
                    <label className="rcx__refund">
                      <input type="checkbox" checked={refund} onChange={(e) => setRefund(e.target.checked)} /> คืนเงินให้ผู้ป่วย {baht(pay.amount)} บาท
                    </label>
                  )}
                  <div className="rcx__voidbtns">
                    <button type="button" onClick={() => setVoiding(false)}>
                      ไม่ยกเลิก
                    </button>
                    <button
                      type="button"
                      className="is-danger"
                      disabled={!reason.trim()}
                      onClick={() => {
                        store.dispatch({ type: "voidPayment", id: a.id, reason: reason.trim(), refund: pay.method !== "credit" && pay.amount > 0 && refund });
                        toast({ message: `ยกเลิกใบเสร็จ ${pay.no} แล้ว · รายการกลับไปรอชำระเงิน` });
                        setVoiding(false);
                        setReason("");
                        onClose();
                      }}
                    >
                      ยืนยันยกเลิกใบเสร็จ
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
      <TaxInvoiceDialog key="tax" apptId={taxFor} onClose={() => setTaxFor(null)} />
    </AnimatePresence>,
    document.body,
  );
}

const Dash = () => <hr className="rcx__dash" />;
const Tear = () => (
  <div className="rcx__tear" aria-hidden>
    <i />
    <i />
  </div>
);
