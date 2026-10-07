import { useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BarChart3, Boxes, HandCoins, Landmark, ShoppingBag, FileSpreadsheet, Banknote, CheckCheck, ChevronRight, Hourglass, QrCode, ReceiptText, Smartphone, Ticket, Wallet } from "lucide-react";
import { clsx } from "clsx";
import { useStore } from "../../store/store";
import { Avatar, Button, EmptyState, IconButton, SearchField, Segmented } from "../../design-system";
import { WorkPage } from "../../layout/WorkPage";
import { AppointmentDrawer, stageOf } from "../../features/AppointmentDrawer";
import { ReceiptDialog } from "../../features/Receipt";
import { METHOD_LABEL } from "../../features/billing";
import { patientPhoto } from "../../data/avatars";
import { addISODays, baht, thaiDate, thaiDateLong, todayISO } from "../../data/thaiDate";
import type { Appointment, Payment, PaymentMethod } from "../../data/types";
import "../appointments/appointments.css";
import { ReportDialog, downloadCsv } from "../../features/ReportDialog";
import "./billing.css";
import "../biz/biz.css";

type Tab = "due" | "history";
type Range = "today" | "7" | "30";
const ICON: Record<PaymentMethod, typeof Banknote> = { cash: Banknote, promptpay: QrCode, app: Smartphone, credit: Ticket };
const time = (iso: string) => new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });

/** คิดเงิน — bills waiting at the counter, and the payment/receipt history. */
export default function Billing() {
  const store = useStore();
  const navigate = useNavigate();
  const today = todayISO();
  const [tab, setTab] = useState<Tab>("due");
  const [range, setRange] = useState<Range>("today");
  const [method, setMethod] = useState<PaymentMethod | "all">("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [report, setReport] = useState(false);

  const match = (a: Appointment) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const p = store.patientById(a.patientId);
    return `${p.name} ${p.hn} ${a.payment?.no ?? ""}`.toLowerCase().includes(q);
  };

  // bills still open: finished treatment not yet paid, plus bills sent to the app
  const due = useMemo(
    () =>
      store.appointments
        .filter((a) => stageOf(a) === "billing" || (a.status === "done" && !a.paid))
        .filter(match)
        .sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store.appointments, query],
  );

  const from = range === "today" ? today : addISODays(today, -(Number(range) - 1));
  // every receipt in the period — current ones and cancelled ones (kept for the record)
  type Entry = { a: Appointment; pay: Payment; key: string };
  const history = useMemo<Entry[]>(
    () =>
      store.appointments
        .flatMap((a) => [...(a.payment ? [{ a, pay: a.payment, key: a.id }] : []), ...(a.voidedPayments ?? []).map((pay) => ({ a, pay, key: `${a.id}|${pay.no}` }))])
        .filter((e) => e.pay.at.slice(0, 10) >= from && e.pay.at.slice(0, 10) <= today)
        .filter((e) => method === "all" || e.pay.method === method)
        .filter((e) => match(e.a) || (query.trim() && (e.pay.no ?? "").includes(query.trim())))
        .sort((x, y) => y.pay.at.localeCompare(x.pay.at)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store.appointments, from, method, query],
  );
  const groups = useMemo(() => {
    const m = new Map<string, Entry[]>();
    for (const e of history) {
      const d = e.pay.at.slice(0, 10);
      if (!m.has(d)) m.set(d, []);
      m.get(d)!.push(e);
    }
    return [...m.entries()];
  }, [history]);

  // today's takings for the rail
  const todays = store.appointments.filter((a) => a.payment && a.payment.at.slice(0, 10) === today);
  const paidToday = todays.filter((a) => a.payment!.status === "paid");
  const income = paidToday.reduce((n, a) => n + a.payment!.amount, 0);
  const byMethod = (m: PaymentMethod) => paidToday.filter((a) => a.payment!.method === m);
  const pendingApp = store.appointments.filter((a) => a.payment?.status === "pending");
  const counterDue = store.appointments.filter((a) => stageOf(a) === "billing").length;
  // donut of today's income by method
  const COL: Record<PaymentMethod, string> = { cash: "#2f9a5b", promptpay: "#3b82c4", app: "#7c5cc4", credit: "#d08a3c" };
  const parts = (["cash", "promptpay", "app"] as PaymentMethod[]).map((m) => ({ m, v: byMethod(m).reduce((n, a) => n + a.payment!.amount, 0) }));
  let acc = 0;
  const donut = income
    ? `conic-gradient(${parts.map(({ m, v }) => { const s0 = acc; acc += (v / income) * 360; return `${COL[m]} ${s0}deg ${acc}deg`; }).join(", ")})`
    : "conic-gradient(#e6ece8 0deg 360deg)";
  // last 7 days of takings
  const paidOn = (d: string) => store.appointments.flatMap((a) => (a.payment && a.payment.status === "paid" && a.payment.at.slice(0, 10) === d ? [a.payment.amount] : [])).reduce((n, x) => n + x, 0);
  const week = Array.from({ length: 7 }, (_, k) => {
    const d = addISODays(today, k - 6);
    return { d, sum: paidOn(d), label: k === 6 ? "วันนี้" : new Date(d + "T00:00:00").toLocaleDateString("th-TH", { weekday: "narrow" }) };
  });
  const weekMax = Math.max(1, ...week.map((x) => x.sum));
  const yesterday = week[5].sum;

  return (
    <WorkPage
      eyebrow="คิดเงิน"
      title="คิดเงิน"
      bell={false}
      actions={
        <>
          <SearchField className="phead-search" value={query} onChange={setQuery} placeholder="ค้นหาชื่อ HN หรือเลขที่ใบเสร็จ" shortcut={false} />
          <Button variant="white" leading={<BarChart3 size={16} />} onClick={() => setReport(true)}>
            รายงาน
          </Button>
          {tab === "history" && (
            <IconButton
              label="ส่งออกประวัติเป็น Excel"
              variant="white"
              onClick={() =>
                downloadCsv(`thaiwell-receipts-${from}-${today}.csv`, [
                  ["เลขที่ใบเสร็จ", "วันที่", "เวลา", "HN", "ชื่อ", "บริการ", "ช่องทาง", "สถานะ", "ยอด (บาท)"],
                  ...history.map(({ a, pay }) => {
                    const p = store.patientById(a.patientId);
                    return [pay.no, pay.at.slice(0, 10), time(pay.at), p.hn, p.name, store.serviceById(a.serviceId).name, METHOD_LABEL[pay.method], pay.status === "paid" ? "ชำระแล้ว" : pay.status === "void" ? `ยกเลิก (${pay.voided?.reason ?? ""})` : "รอชำระในแอป", pay.status === "void" ? 0 : pay.amount];
                  }),
                ])
              }
            >
              <FileSpreadsheet size={18} />
            </IconButton>
          )}
        </>
      }
    >
      <div className="appt">
        <aside className="appt__rail scroll-y bl2-rail">
          {/* today's income with a method donut */}
          <section className="bl2-card bl2-income">
            <header>
              <b>รายรับวันนี้</b>
              <small>{thaiDate(today)}</small>
            </header>
            <div className="bl2-income__row">
              <div className="bl2-donut" style={{ background: donut }}>
                <span>
                  <b>{paidToday.length}</b>
                  <small>ใบเสร็จ</small>
                </span>
              </div>
              <div className="bl2-income__sum">
                <b>{baht(income)}</b>
                <small>บาท</small>
                {yesterday > 0 && (
                  <em className={income >= yesterday ? "is-up" : "is-down"}>
                    {income >= yesterday ? "▲" : "▼"} {Math.abs(Math.round(((income - yesterday) / yesterday) * 100))}% จากเมื่อวาน
                  </em>
                )}
              </div>
            </div>
            <div className="bl2-legend">
              {(["cash", "promptpay", "app"] as PaymentMethod[]).map((m) => {
                const sum = byMethod(m).reduce((n, a) => n + a.payment!.amount, 0);
                const Ic = ICON[m];
                return (
                  <div key={m}>
                    <span className={`bl-mi bl-mi--${m}`}>
                      <Ic size={14} />
                    </span>
                    <span>
                      {METHOD_LABEL[m]}
                      <small>{byMethod(m).length} รายการ</small>
                    </span>
                    <b>{baht(sum)}</b>
                  </div>
                );
              })}
              <div>
                <span className="bl-mi bl-mi--credit">
                  <Ticket size={14} />
                </span>
                <span>
                  หักเครดิตคอร์ส
                  <small>ไม่มีรายรับเงินสด</small>
                </span>
                <b>{byMethod("credit").length} ครั้ง</b>
              </div>
            </div>
          </section>

          {/* back-office tools */}
          <section className="bl2-card">
            <header>
              <b>เมนูการเงิน</b>
            </header>
            <div className="bz-menu">
              <button type="button" style={{ ["--mc" as string]: "#2f8a52" }} onClick={() => navigate("/billing/close")}>
                <span>
                  <Landmark size={16} />
                </span>
                <b>ปิดยอดวันนี้</b>
                {store.biz.closings.some((c) => c.date === today) ? <small>ปิดแล้ว</small> : <em>ยังไม่ปิดยอด</em>}
              </button>
              <button type="button" style={{ ["--mc" as string]: "#7c5cc4" }} onClick={() => navigate("/billing/commission")}>
                <span>
                  <HandCoins size={16} />
                </span>
                <b>ค่ามือผู้บำบัด</b>
                <small>สรุปรายเดือน</small>
              </button>
              <button type="button" style={{ ["--mc" as string]: "#d08a3c" }} onClick={() => navigate("/packages")}>
                <span>
                  <ShoppingBag size={16} />
                </span>
                <b>คอร์ส/แพ็กเกจ</b>
                <small>{store.biz.packages.filter((x) => x.active).length} แพ็กเกจ</small>
              </button>
              <button type="button" style={{ ["--mc" as string]: "#0f766e" }} onClick={() => navigate("/inventory")}>
                <span>
                  <Boxes size={16} />
                </span>
                <b>คลังสินค้า</b>
                {(() => {
                  const low = store.biz.items.filter((i) => i.stock <= i.min).length;
                  return low ? <em>ใกล้หมด {low} รายการ</em> : <small>สต็อกปกติ</small>;
                })()}
              </button>
            </div>
          </section>

          {/* last 7 days */}
          <section className="bl2-card">
            <header>
              <b>7 วันล่าสุด</b>
              <small>{baht(week.reduce((n, x) => n + x.sum, 0))} บาท</small>
            </header>
            <div className="bl2-week">
              {week.map((x) => (
                <div key={x.d} className={x.d === today ? "is-today" : undefined}>
                  <i>
                    <motion.i initial={{ height: 0 }} animate={{ height: `${(x.sum / weekMax) * 100}%` }} transition={{ duration: 0.5 }} />
                  </i>
                  <small>{x.label}</small>
                </div>
              ))}
            </div>
          </section>

          {/* waiting */}
          <section className="bl2-card">
            <header>
              <b>รอชำระ</b>
            </header>
            <div className="bl2-due">
              <button type="button" onClick={() => setTab("due")}>
                <span className="bl-mi bl-mi--due">
                  <Wallet size={15} />
                </span>
                <b>{counterDue}</b>
                <small>ที่เคาน์เตอร์</small>
              </button>
              <button type="button" onClick={() => setTab("due")}>
                <span className="bl-mi bl-mi--app">
                  <Smartphone size={15} />
                </span>
                <b>{pendingApp.length}</b>
                <small>บิลในแอป · {baht(pendingApp.reduce((n, a) => n + a.payment!.amount, 0))} ฿</small>
              </button>
            </div>
          </section>
        </aside>

        <div className="panel appt__main">
          <div className="sheet">
            <div className="appt__bar">
              <Segmented
                tone="light"
                label="มุมมอง"
                value={tab}
                onChange={setTab}
                options={[
                  { value: "due", label: `รอชำระ (${due.length})` },
                  { value: "history", label: "ประวัติการชำระ" },
                ]}
              />
              {tab === "history" && (
                <div className="bl-filters">
                  <Segmented
                    tone="light"
                    label="ช่วงเวลา"
                    value={range}
                    onChange={setRange}
                    options={[
                      { value: "today", label: "วันนี้" },
                      { value: "7", label: "7 วัน" },
                      { value: "30", label: "30 วัน" },
                    ]}
                  />
                </div>
              )}
            </div>
            {tab === "history" && (
              <div className="bl-chips">
                {(["all", "cash", "promptpay", "app", "credit"] as const).map((m) => (
                  <button key={m} type="button" aria-pressed={method === m} onClick={() => setMethod(m)}>
                    {m === "all" ? "ทุกช่องทาง" : METHOD_LABEL[m]}
                  </button>
                ))}
                <span className="bl-sum">
                  รวม <b>{baht(history.filter((e) => e.pay.status === "paid").reduce((n, e) => n + e.pay.amount, 0))}</b> บาท · {history.length} รายการ
                </span>
              </div>
            )}

            <div className="bl-list scroll-y scroll-y--light">
              {tab === "due" &&
                (due.length ? (
                  due.map((a) => {
                    const p = store.patientById(a.patientId);
                    const s = store.serviceById(a.serviceId);
                    const pending = a.payment?.status === "pending";
                    return (
                      <div key={a.id} className={clsx("bl2-bill", pending ? "is-app" : stageOf(a) === "billing" ? "is-counter" : "is-late")} role="button" tabIndex={0} onClick={() => navigate(`/billing/${a.id}`)}>
                        <Avatar name={p.name} src={patientPhoto(p)} size="md" shape="squircle" />
                        <span className="bl2-bill__who">
                          <b>{p.name}</b>
                          <small>
                            {s.name} · {thaiDate(a.date)} {a.start} น.
                          </small>
                          <em>{pending ? "ส่งบิลเข้าแอปแล้ว · รอผู้ป่วยชำระ" : stageOf(a) === "billing" ? "รักษาเสร็จแล้ว · รอคิดเงิน" : "ค้างชำระ"}</em>
                        </span>
                        <span className="bl2-bill__amt">
                          <b>{baht(a.payment?.amount ?? s.price)}</b>
                          <small>บาท</small>
                        </span>
                        <Button size="md" variant={pending ? "outline" : "primary"} leading={<Wallet size={15} />} onClick={(e) => (e.stopPropagation(), setOpen(a.id))}>
                          {pending ? "ดูบิล" : "รับชำระ"}
                        </Button>
                      </div>
                    );
                  })
                ) : (
                  <EmptyState icon={<Hourglass size={24} />} title="ไม่มีบิลรอชำระ" description="ผู้ป่วยที่รักษาเสร็จแล้วจะมารอคิดเงินที่นี่" />
                ))}

              {tab === "history" &&
                (groups.length ? (
                  groups.map(([d, list]) => (
                    <section key={d} className="bl-group">
                      <p className="bl-group__label">
                        {d === today ? "วันนี้" : thaiDateLong(d)}
                        <span>{baht(list.filter((e) => e.pay.status === "paid").reduce((n, e) => n + e.pay.amount, 0))} บาท</span>
                      </p>
                      {list.map(({ a, pay, key }) => {
                        const p = store.patientById(a.patientId);
                        const Ic = ICON[pay.method];
                        return (
                          <button key={key} type="button" className={clsx("bl2-rc", pay.status === "void" && "is-void", pay.status === "pending" && "is-pending")} onClick={() => navigate(`/billing/${a.id}`)}>
                            <span className={clsx("bl-mi", `bl-mi--${pay.method}`)}>
                              <Ic size={16} />
                            </span>
                            <span className="bl2-rc__who">
                              <b>{p.name}</b>
                              <small>
                                {store.serviceById(a.serviceId).short} · {time(pay.at)} น.
                              </small>
                            </span>
                            <span className="bl2-rc__no">{pay.no}</span>
                            <span className="bl2-rc__st">
                              {pay.status === "void" ? (pay.voided?.refund ? "ยกเลิก · คืนเงิน" : "ยกเลิก") : pay.status === "pending" ? "รอชำระในแอป" : METHOD_LABEL[pay.method]}
                              {pay.slipSentAt && pay.status === "paid" && (
                                <i title="ส่งสลิปเข้าแอปแล้ว">
                                  <CheckCheck size={12} />
                                </i>
                              )}
                            </span>
                            <b className="bl2-rc__amt">{pay.method === "credit" ? <span className="bl2-rc__cr">1 ครั้ง</span> : `${baht(pay.amount)} ฿`}</b>
                            <ChevronRight size={16} className="bl-chev" />
                          </button>
                        );
                      })}
                    </section>
                  ))
                ) : (
                  <EmptyState icon={<ReceiptText size={24} />} title="ไม่มีรายการในช่วงนี้" description="ลองเปลี่ยนช่วงเวลาหรือช่องทางการชำระ" />
                ))}
            </div>
          </div>
        </div>
      </div>

      <AppointmentDrawer id={open} startPay onClose={() => setOpen(null)} />
      <ReceiptDialog id={receipt} onClose={() => setReceipt(null)} />
      <ReportDialog open={report} onClose={() => setReport(false)} />
    </WorkPage>
  );
}
