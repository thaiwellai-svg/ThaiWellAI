import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Banknote, CalendarDays, CheckCheck, ClipboardList, History, Phone, QrCode, ReceiptText, Smartphone, Ticket, UserRound, Wallet } from "lucide-react";
import { clsx } from "clsx";
import { useStore } from "../../store/store";
import { Avatar, Button, EmptyState } from "../../design-system";
import { WorkPage } from "../../layout/WorkPage";
import { BackLead } from "../../layout/BackLead";
import { AppointmentDrawer, stageOf } from "../../features/AppointmentDrawer";
import { ReceiptDialog } from "../../features/Receipt";
import { METHOD_LABEL } from "../../features/billing";
import { creditInfo } from "../../data/domain";
import { patientPhoto, therapistPhoto } from "../../data/avatars";
import { baht, thaiDateLong, thaiDateShort } from "../../data/thaiDate";
import type { PaymentMethod } from "../../data/types";
import "../appointments/appointment-detail.css";
import "./billing.css";

const ICON: Record<PaymentMethod, typeof Banknote> = { cash: Banknote, promptpay: QrCode, app: Smartphone, credit: Ticket };
const clock = (iso: string) => new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });

/** /billing/:id — one visit's bill: line items, payment, receipts (current + cancelled), course credit and activity */
export default function BillDetail() {
  const { id } = useParams();
  const store = useStore();
  const navigate = useNavigate();
  const [receipt, setReceipt] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const a = store.appointments.find((x) => x.id === id);
  const back = () => (window.history.length > 1 ? navigate(-1) : navigate("/billing"));

  if (!a)
    return (
      <WorkPage eyebrow="คิดเงิน" title="รายละเอียดบิล" bell={false} lead={<BackLead eyebrow="คิดเงิน" title="รายละเอียดบิล" onBack={back} />}>
        <div className="sheet ad__none">
          <EmptyState icon={<ReceiptText size={24} />} title="ไม่พบบิลนี้" description="รายการอาจถูกลบไปแล้ว" />
        </div>
      </WorkPage>
    );

  const p = store.patientById(a.patientId);
  const s = store.serviceById(a.serviceId);
  const t = store.therapistById(a.therapistId);
  const pay = a.payment;
  const credits = creditInfo(p, store.appointments);
  const status: { label: string; color: string } =
    a.status === "cancelled"
      ? { label: "นัดถูกยกเลิก", color: "#8a948d" }
      : pay?.status === "paid"
        ? { label: "ชำระแล้ว", color: "#2f9a5b" }
        : pay?.status === "pending"
          ? { label: "รอชำระในแอป", color: "#7c5cc4" }
          : stageOf(a) === "billing"
            ? { label: "รอคิดเงิน", color: "#d08a3c" }
            : a.status === "done"
              ? { label: "ค้างชำระ", color: "#d23a2a" }
              : { label: "ยังไม่ถึงขั้นชำระเงิน", color: "#8a948d" };
  const canPay = !pay || pay.status !== "paid";
  const Ic = pay ? ICON[pay.method] : Wallet;
  const credit = pay?.method === "credit";
  const discount = credit ? s.price : Math.max(0, s.price - (pay?.amount ?? s.price));
  const total = pay?.amount ?? s.price;
  const receipts = [...(pay ? [{ pay, key: a.id }] : []), ...(a.voidedPayments ?? []).map((x) => ({ pay: x, key: `${a.id}|${x.no}` }))];
  const money = (a.log ?? []).filter((l) => /ชำระ|ใบเสร็จ|เครดิต|บิล|สลิป|เงิน/.test(l.label));

  return (
    <WorkPage eyebrow="คิดเงิน" title="รายละเอียดบิล" bell={false} lead={<BackLead eyebrow={`คิดเงิน · ${p.name}`} title="รายละเอียดบิล" onBack={back} />}>
      <div className="adp">
        <div className="adp__bar">
          <span className="adp__status" style={{ ["--sc" as string]: status.color }}>
            <i /> {status.label}
          </span>
          {pay?.no && <span className="adp__tag">{pay.no}</span>}
          {pay && (
            <span className="adp__tag">
              <Ic size={13} /> {METHOD_LABEL[pay.method]}
            </span>
          )}
          <div className="adp__actions">
            <Button variant="outline" size="md" leading={<CalendarDays size={16} />} onClick={() => navigate(`/appointments/${a.id}`)}>
              รายละเอียดนัด
            </Button>
            {pay && (
              <Button variant="outline" size="md" leading={<ReceiptText size={16} />} onClick={() => setReceipt(a.id)}>
                ใบเสร็จ
              </Button>
            )}
            {canPay && a.status !== "cancelled" && (stageOf(a) === "billing" || a.status === "done") && (
              <Button size="md" leading={<Wallet size={16} />} onClick={() => setPaying(true)}>
                {pay?.status === "pending" ? "ดูบิล / รับชำระ" : "รับชำระ"}
              </Button>
            )}
          </div>
        </div>

        <div className="adp__body scroll-y scroll-y--light">
          {/* hero: amount + who */}
          <section className="adp__hero bd__hero" style={{ ["--sc" as string]: status.color }}>
            <div className="bd__amount">
              <small>{pay?.status === "paid" ? "ยอดชำระ" : "ยอดที่ต้องชำระ"}</small>
              <b>
                {credit ? "1" : baht(total)}
                <u>{credit ? " ครั้ง" : " บาท"}</u>
              </b>
              <p>
                {pay?.status === "paid"
                  ? `${METHOD_LABEL[pay.method]} · ${thaiDateShort(pay.at.slice(0, 10))} ${clock(pay.at)} น.`
                  : pay?.status === "pending"
                    ? `ส่งบิลเข้าแอปแล้ว · ${thaiDateShort(pay.at.slice(0, 10))} ${clock(pay.at)} น.`
                    : `${s.name} · ${thaiDateShort(a.date)} ${a.start} น.`}
              </p>
            </div>
            <div className="adp__who">
              <Avatar name={p.name} src={patientPhoto(p)} size="lg" shape="squircle" />
              <div>
                <b>{p.name}</b>
                <small>
                  {p.hn} · {p.gender} {p.age} ปี
                </small>
                <span>
                  {p.phone && (
                    <a href={`tel:${p.phone}`}>
                      <Phone size={13} /> {p.phone}
                    </a>
                  )}
                  <button type="button" onClick={() => navigate(`/patients?id=${p.id}`)}>
                    <UserRound size={13} /> ประวัติผู้ป่วย
                  </button>
                </span>
              </div>
            </div>
          </section>

          <div className="adp__grid">
            <div className="adp__col">
              {/* line items */}
              <section className="adp__card">
                <header>
                  <ClipboardList size={15} /> รายการ
                </header>
                <div className="bd__lines">
                  <div>
                    <span>
                      <b>{s.name}</b>
                      <small>
                        {s.minutes} นาที · {thaiDateLong(a.date)} {a.start} น.
                      </small>
                    </span>
                    <b>{baht(s.price)}</b>
                  </div>
                  {discount > 0 && (
                    <div className="is-minus">
                      <span>
                        <b>{credit ? "หักเครดิตคอร์ส" : "ส่วนลด"}</b>
                        <small>{credit && p.course ? p.course.name : ""}</small>
                      </span>
                      <b>−{baht(discount)}</b>
                    </div>
                  )}
                  <div className="is-total">
                    <span>
                      <b>ยอดสุทธิ</b>
                    </span>
                    <b>{baht(credit ? 0 : total)} บาท</b>
                  </div>
                  {pay?.received != null && pay.method === "cash" && (
                    <div className="is-sub">
                      <span>รับเงิน {baht(pay.received)} · ทอน</span>
                      <b>{baht(Math.max(0, pay.received - pay.amount))}</b>
                    </div>
                  )}
                </div>
              </section>

              {/* who / when */}
              <section className="adp__card">
                <header>
                  <CalendarDays size={15} /> การรับบริการ
                </header>
                <div className="adp__facts">
                  <div>
                    <small>ผู้บำบัด</small>
                    <b className="adp__staff">
                      <Avatar name={t.name} src={therapistPhoto(t)} size="xs" color={t.color} />
                      {t.name}
                    </b>
                  </div>
                  <div>
                    <small>เวลารับบริการ</small>
                    <b>{a.startedAt ? `${clock(a.startedAt)}–${a.endedAt ? clock(a.endedAt) : "…"} น.` : `${a.start} น.`}</b>
                  </div>
                  <div>
                    <small>สลิปเข้าแอป</small>
                    <b>{pay?.slipSentAt ? `ส่งแล้ว ${clock(pay.slipSentAt)} น.` : "ยังไม่ส่ง"}</b>
                  </div>
                  <div>
                    <small>เครดิตคอร์ส</small>
                    <b>{credits ? `เหลือ ${credits.remaining} ครั้ง` : "ไม่มีคอร์ส"}</b>
                    {credits && <em>ใช้แล้ว {credits.used} · จองไว้ {credits.booked}</em>}
                  </div>
                </div>
              </section>
            </div>

            <div className="adp__col">
              {/* receipts */}
              <section className="adp__card">
                <header>
                  <ReceiptText size={15} /> ใบเสร็จ
                  {receipts.length > 0 && <em>{receipts.length} ใบ</em>}
                </header>
                {receipts.length ? (
                  <div className="bd__rcs">
                    {receipts.map(({ pay: x, key }) => {
                      const XI = ICON[x.method];
                      return (
                        <button key={key} type="button" className={clsx("bd__rc", x.status === "void" && "is-void", x.status === "pending" && "is-pending")} onClick={() => setReceipt(key)}>
                          <span className={clsx("bl-mi", `bl-mi--${x.method}`)}>
                            <XI size={15} />
                          </span>
                          <span>
                            <b>{x.no ?? "บิลในแอป"}</b>
                            <small>
                              {thaiDateShort(x.at.slice(0, 10))} {clock(x.at)} น. · {METHOD_LABEL[x.method]}
                            </small>
                            {x.status === "void" && x.voided && (
                              <small className="bd__void">
                                ยกเลิก{x.voided.refund ? " · คืนเงิน" : ""} · {x.voided.reason} · โดย {x.voided.by}
                              </small>
                            )}
                          </span>
                          <b>{x.method === "credit" ? "1 ครั้ง" : `${baht(x.amount)} ฿`}</b>
                          {x.slipSentAt && x.status === "paid" && <CheckCheck size={14} className="bd__sent" />}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="adp__muted">ยังไม่มีใบเสร็จ · กด “รับชำระ” เพื่อออกใบเสร็จ</p>
                )}
              </section>

              {/* money activity */}
              <section className="adp__card">
                <header>
                  <History size={15} /> ความเคลื่อนไหวการเงิน
                </header>
                {money.length ? (
                  <ol className="adp__log">
                    {[...money].reverse().map((l, i) => (
                      <li key={i}>
                        <span>{l.label}</span>
                        <time>
                          {thaiDateShort(l.at.slice(0, 10))} · {clock(l.at)} น.
                        </time>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="adp__muted">ยังไม่มีความเคลื่อนไหว</p>
                )}
              </section>
            </div>
          </div>
        </div>
      </div>

      <ReceiptDialog id={receipt} onClose={() => setReceipt(null)} />
      <AppointmentDrawer id={paying ? a.id : null} onClose={() => setPaying(false)} />
    </WorkPage>
  );
}
