import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Banknote, CalendarDays, CheckCheck, ClipboardList, History, Phone, QrCode, ReceiptText, Smartphone, Ticket, UserRound, Wallet } from "lucide-react";
import { clsx } from "clsx";
import { MoreMenu } from "../../features/MoreMenu";
import { useStore } from "../../store/store";
import { Avatar, Button, EmptyState } from "../../design-system";
import { WorkPage } from "../../layout/WorkPage";
import { BackLead } from "../../layout/BackLead";
import { AppointmentDrawer, stageOf } from "../../features/AppointmentDrawer";
import { ReceiptDialog } from "../../features/Receipt";
import { METHOD_LABEL, extraLines, usesCredit } from "../../features/billing";
import { creditInfo, visitPrice } from "../../data/domain";
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
  const a = store.appointments.find((x) => x.id === id);
  const back = () => (window.history.length > 1 ? navigate(-1) : navigate("/billing"));
  const p = a ? store.patientById(a.patientId) : undefined;
  return (
    <WorkPage eyebrow="ชำระเงิน" title="รายละเอียดบิล" bell={false} lead={<BackLead eyebrow={p ? `ชำระเงิน · ${p.name}` : "ชำระเงิน"} title="รายละเอียดบิล" onBack={back} />}>
      <BillPanel id={id ?? ""} />
    </WorkPage>
  );
}

/** รายละเอียดบิล (ใช้ทั้งหน้าเต็ม /billing/:id และคอลัมน์ขวาของหน้าชำระเงิน) */
export function BillPanel({ id, compact }: { id: string; /** คอลัมน์ขวาของหน้าชำระเงิน: เรียงคอลัมน์เดียว ปุ่มรับชำระติดล่าง */ compact?: boolean }) {
  const store = useStore();
  const navigate = useNavigate();
  const [receipt, setReceipt] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const a = store.appointments.find((x) => x.id === id);
  if (!a)
    return (
      <div className="sheet ad__none">
        <EmptyState icon={<ReceiptText size={24} />} title="ไม่พบบิลนี้" description="รายการอาจถูกลบไปแล้ว" />
      </div>
    );

  const p = store.patientById(a.patientId);
  const s = store.serviceById(a.serviceId);
  const t = store.therapistById(a.therapistId);
  const pay = a.payment;
  const credits = creditInfo(p, store.appointments);
  const status: { label: string; color: string } =
    a.status === "cancelled"
      ? { label: "ยกเลิกนัดแล้ว", color: "#8a948d" }
      : pay?.status === "paid"
        ? { label: "ชำระแล้ว", color: "#2f9a5b" }
        : pay?.status === "pending"
          ? { label: "รอชำระในแอป", color: "#7c5cc4" }
          : stageOf(a) === "billing"
            ? { label: "รอชำระ", color: "#d08a3c" }
            : a.status === "done"
              ? { label: "ค้างชำระ", color: "#d23a2a" }
              : { label: "ยังไม่ถึงขั้นชำระ", color: "#8a948d" };
  const canPay = !pay || pay.status !== "paid";
  const payable = canPay && a.status !== "cancelled" && (stageOf(a) === "billing" || a.status === "done");
  const Ic = pay ? ICON[pay.method] : Wallet;
  const credit = usesCredit(pay);
  const extras = pay?.items ? pay.items.slice(1) : extraLines(a);
  const unit = visitPrice(p, a, s);
  const full = unit + extras.reduce((n, l) => n + l.amount, 0);
  const discount = credit ? unit : Math.max(0, full - (pay?.amount ?? full));
  const total = pay?.amount ?? full;
  const receipts = [...(pay ? [{ pay, key: a.id }] : []), ...(a.voidedPayments ?? []).map((x) => ({ pay: x, key: `${a.id}|${x.no}` }))];
  const money = (a.log ?? []).filter((l) => /ชำระ|ใบเสร็จ|เครดิต|บิล|สลิป|เงิน/.test(l.label));

  return (
    <>
      <div className={clsx("adp tw-panel", compact && "bd--compact")} data-bill={a.id}>
        {/* หัวตรึงแบบกลาง: รูป · ชื่อ · สถานะบิล · ปุ่ม */}
        <header className={compact ? "tw-panel__head" : "tw-panel__head adp__head"}>
          <Avatar name={p.name} src={patientPhoto(p)} size="card" shape="squircle" ring={status.color} />
          <div className="tw-panel__id">
            <h2>{p.name}</h2>
            <p>
              {p.hn} · {p.gender} {p.age} ปี
              {/* แบบหัวหน้ารับบริการ/ผู้ป่วย: สถานะต่อท้ายบรรทัดเดียว ไม่มีแถวชิป */}
              {compact && (
                <span className="bd__st" style={{ ["--sc" as string]: status.color }}>
                  {" · "}
                  {status.label}
                </span>
              )}
            </p>
            {!compact && (
            <div className="adp__chips">
              <span className="adp__status" style={{ ["--sc" as string]: status.color }}>
                <i /> {status.label}
              </span>
              {pay?.no && <span className="tw-chip">{pay.no}</span>}
              {pay && (
                <span className="tw-chip">
                  <Ic size={12} /> {METHOD_LABEL[pay.method]}
                </span>
              )}
            </div>
            )}
          </div>
          <div className={compact ? "tw-panel__actions pd__icons" : "tw-panel__actions"}>
            {compact ? (
              // คอลัมน์แคบ (หน้าชำระเงิน): เหมือนหัวหน้ารับบริการ/ผู้ป่วย = ปุ่มเพิ่มเติม (วงกลม) + ปุ่มหลัก
              <MoreMenu
                items={[
                  ...(pay ? [{ label: "ดูใบเสร็จ", icon: <ReceiptText size={16} />, onClick: () => setReceipt(a.id) }] : []),
                  { label: "ข้อมูลผู้ป่วย", icon: <UserRound size={16} />, onClick: () => navigate(`/patients?id=${p.id}`) },
                  { label: "รายละเอียดนัด", icon: <CalendarDays size={16} />, onClick: () => navigate(`/appointments/${a.id}`) },
                  ...(p.phone ? [{ label: `โทร ${p.phone}`, icon: <Phone size={16} />, onClick: () => (window.location.href = `tel:${p.phone}`) }] : []),
                ]}
              />
            ) : (
              <>
                {p.phone && (
                  <a className="tw-round" href={`tel:${p.phone}`} aria-label={`โทร ${p.phone}`} title={p.phone}>
                    <Phone size={18} />
                  </a>
                )}
                <button type="button" className="tw-round" onClick={() => navigate(`/patients?id=${p.id}`)} aria-label="ข้อมูลผู้ป่วย" title="ข้อมูลผู้ป่วย">
                  <UserRound size={18} />
                </button>
                <button type="button" className="tw-round" onClick={() => navigate(`/appointments/${a.id}`)} aria-label="รายละเอียดนัด" title="รายละเอียดนัด">
                  <CalendarDays size={18} />
                </button>
                {pay && (
                  <Button variant="outline" size="lg" leading={<ReceiptText size={16} />} onClick={() => setReceipt(a.id)}>
                    ใบเสร็จ
                  </Button>
                )}
              </>
            )}
            {payable &&
              (compact ? (
                // ปุ่มหลักแบบวงกลมสีเขียว เหมือน "จัดนัด" ในหัวหน้าผู้ป่วย
                <button type="button" className="pd__ib is-primary" onClick={() => setPaying(true)} aria-label="รับชำระ" title="รับชำระ">
                  <Wallet size={19} />
                </button>
              ) : (
                <Button size="lg" leading={<Wallet size={16} />} onClick={() => setPaying(true)}>
                  รับชำระ
                </Button>
              ))}
          </div>
        </header>

        <div className="adp__body tw-panel__body scroll-y scroll-y--light">
          {/* hero: ยอดเงิน */}
          <section className="adp__hero bd__hero" style={{ ["--sc" as string]: status.color }}>
            <div className="bd__amount">
              <small>{pay?.status === "paid" ? "ยอดชำระแล้ว" : "ยอดต้องชำระ"}</small>
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
                    <b>{baht(unit)}</b>
                  </div>
                  {extras.map((l, i) => (
                    <div key={`${l.name}${i}`}>
                      <span>
                        <b>{l.name}</b>
                        <small>หัตถการเพิ่ม</small>
                      </span>
                      <b>{baht(l.amount)}</b>
                    </div>
                  ))}
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
                    <b>{baht(pay?.method === "credit" ? 0 : total)} บาท</b>
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
                  <CalendarDays size={15} /> ข้อมูลนัด
                </header>
                <div className={compact ? "bd__kv" : "adp__facts"}>
                  <div>
                    <small>ผู้บำบัด</small>
                    <b className="adp__staff">
                      <Avatar name={t.name} src={therapistPhoto(t)} size="xs" color={t.color} />
                      {t.name}
                    </b>
                  </div>
                  <div>
                    <small>เวลานวด</small>
                    <b>{a.startedAt ? `${clock(a.startedAt)}–${a.endedAt ? clock(a.endedAt) : "…"} น.` : `${a.start} น.`}</b>
                  </div>
                  <div>
                    <small>ส่งสลิปเข้าแอป</small>
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
              {(!compact || receipts.length > 0) && (
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
                  <p className="adp__muted">ยังไม่มีใบเสร็จ</p>
                )}
              </section>
              )}
              {/* money activity */}
              {(!compact || money.length > 0) && (
              <section className="adp__card">
                <header>
                  <History size={15} /> ประวัติการเงิน
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
                  <p className="adp__muted">ยังไม่มีประวัติ</p>
                )}
              </section>
              )}
              {compact && !receipts.length && !money.length && <p className="bd__none">ยังไม่มีใบเสร็จและประวัติการเงิน</p>}
            </div>
          </div>
        </div>
      </div>

      <ReceiptDialog id={receipt} onClose={() => setReceipt(null)} />
      <AppointmentDrawer id={paying ? a.id : null} startPay onClose={() => setPaying(false)} />
    </>
  );
}
