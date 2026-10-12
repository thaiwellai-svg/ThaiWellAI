import { useNavigate } from "react-router-dom";
import { visitPrice } from "../../data/domain";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BarChart3, ChevronDown, History, Maximize2, Minimize2, Boxes, HandCoins, Landmark, ShoppingBag, FileSpreadsheet, Banknote, CheckCheck, Hourglass, QrCode, ReceiptText, Smartphone, Ticket, Wallet } from "lucide-react";
import { clsx } from "clsx";
import { useStore } from "../../store/store";
import { Avatar, Badge, Button, EmptyState, IconButton, SearchField, Segmented } from "../../design-system";
import { BackLead } from "../../layout/BackLead";
import { WorkPage } from "../../layout/WorkPage";
import { Workspace } from "../../features/Workspace";
import { thaiDateShort } from "../../data/thaiDate";
import { BillPanel } from "./BillDetail";
import { AppointmentDrawer, stageOf } from "../../features/AppointmentDrawer";
import { ReceiptDialog } from "../../features/Receipt";
import { METHOD_LABEL, visitTotal } from "../../features/billing";
import { patientPhoto } from "../../data/avatars";
import { addISODays, baht, thaiDate, thaiDateLong, todayISO } from "../../data/thaiDate";
import type { Appointment, Payment, PaymentMethod } from "../../data/types";
import "../appointments/appointments.css";
import { ReportDialog, downloadCsv } from "../../features/ReportDialog";
import "../patients/patients.css";
import "./billing.css";
import "../biz/biz.css";

type Tab = "due" | "history";
type Range = "today" | "7" | "30";
const ICON: Record<PaymentMethod, typeof Banknote> = { cash: Banknote, promptpay: QrCode, app: Smartphone, credit: Ticket };
const time = (iso: string) => new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });

/** จอกว้างพอสำหรับแผงปรับขนาดได้ (เหมือนหน้าผู้ป่วย) */
function useWideBill() {
  const q = "(min-width: 1000px)";
  const [w, setW] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setW(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return w;
}

/** ชำระเงิน — bills waiting at the counter, and the payment/receipt history. */
export default function Billing({ history: hist = false }: { /** /billing/history: หน้าประวัติการชำระ */ history?: boolean } = {}) {
  const store = useStore();
  const navigate = useNavigate();
  const today = todayISO();
  const tab: Tab = hist ? "history" : "due";
  const [range, setRange] = useState<Range>("today");
  const [method, setMethod] = useState<PaymentMethod | "all">("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [report, setReport] = useState(false);
  // บิลที่เปิดดูในคอลัมน์ขวา (จอแคบ → เปิดหน้ารายละเอียดเต็มแทน)
  const [sel, setSel] = useState<string | null>(null);
  const [allDue, setAllDue] = useState(false);
  const [solo, setSolo] = useState(false);
  const wide = useWideBill();
  const openBill = (id: string) => (wide ? setSel(id) : navigate(`/billing/${id}`));

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
  const dueRow = (a: Appointment) => {
                    const p = store.patientById(a.patientId);
                    const s = store.serviceById(a.serviceId);
                    const pending = a.payment?.status === "pending";
                    const st = pending ? (["รอชำระในแอป", "info"] as const) : stageOf(a) === "billing" ? (["รอชำระ", "warning"] as const) : (["ค้างชำระ", "danger"] as const);
                    return (
                      <button key={a.id} type="button" className={clsx("prow bl3-row", pending ? "is-app" : stageOf(a) === "billing" ? "is-counter" : "is-late")} aria-pressed={shown === a.id} onClick={() => openBill(a.id)}>
                        {shown === a.id && <motion.span layoutId="bill-sel" className="prow__sel" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                        <Avatar name={p.name} src={patientPhoto(p)} shape="squircle" />
                        <span className="prow__id">
                          <b>{p.name}</b>
                          <small>
                            {s.short} · {thaiDateShort(a.date)} {a.start} น.
                          </small>
                          <span className="prow__chips">
                            <Badge tone={st[1]} compact>
                              {st[0]}
                            </Badge>
                          </span>
                        </span>
                        <span className="prow__meta">
                          <span className="prow__next bl3__amt">
                            {baht(a.payment?.amount ?? visitTotal({ price: visitPrice(p, a, s) }, a))}
                            <small>บาท</small>
                          </span>
                        </span>
                      </button>
                    );
                  };
  const firstId = tab === "due" ? due[0]?.id : history[0]?.a.id;
  const shown = sel && store.appointments.some((x) => x.id === sel) ? sel : (firstId ?? null);
  const yesterday = week[5].sum;

  return (
    <WorkPage
      eyebrow="การเงิน"
      title={hist ? "ประวัติการชำระ" : "ชำระเงิน"}
      bell={false}
      lead={hist ? <BackLead eyebrow="ชำระเงิน" title="ประวัติการชำระ" onBack={() => navigate("/billing")} /> : undefined}
      actions={
        <>
          <SearchField className="phead-search" value={query} onChange={setQuery} placeholder="ค้นชื่อ, HN, เลขใบเสร็จ" shortcut={false} />
          {!hist && (
            <Button variant="white" leading={<History size={16} />} onClick={() => navigate("/billing/history")}>
              ประวัติการชำระ
            </Button>
          )}
          <Button variant="white" leading={<BarChart3 size={16} />} onClick={() => setReport(true)}>
            รายงาน
          </Button>
          {tab === "history" && (
            <IconButton
              label="ส่งออก Excel"
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
      {(() => {
        const railNode = (

        <aside className="appt__rail scroll-y bl2-rail">
          {/* รายชื่อรอชำระ: บนสุด แสดง 5 คนแรก · เกินกด "ดูเพิ่มเติม" ขยายทั้งหมด */}
          <section className="bl3__due plist">
            <p className="bl3__day">
              รอชำระ {due.length} คน
              {due.length > 0 && <span>{baht(due.reduce((n, a) => n + (a.payment?.amount ?? visitTotal({ price: visitPrice(store.patientById(a.patientId), a, store.serviceById(a.serviceId)) }, a)), 0))} บาท</span>}
            </p>
            {due.length ? (
              <div className="bl3__rows">{(allDue ? due : due.slice(0, 5)).map(dueRow)}</div>
            ) : (
              <EmptyState onGlass icon={<Hourglass size={24} />} title="ไม่มีบิลรอชำระ" description="ผู้ป่วยที่นวดเสร็จจะแสดงที่นี่" />
            )}
            {due.length > 5 && (
              <button type="button" className="bl3__more" onClick={() => setAllDue((v) => !v)}>
                {allDue ? "ย่อรายการ" : `ดูเพิ่มเติม (อีก ${due.length - 5} คน)`}
                <ChevronDown size={15} className={allDue ? "is-up" : undefined} />
              </button>
            )}
          </section>

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
                  <small>ไม่นับเป็นรายรับ</small>
                </span>
                <b>{byMethod("credit").length} ครั้ง</b>
              </div>
            </div>
          </section>

          {/* back-office tools */}
          <section className="bl2-card">
            <header>
              <b>งานการเงิน</b>
            </header>
            <div className="bz-menu">
              <button type="button" style={{ ["--mc" as string]: "#2f8a52" }} onClick={() => navigate("/billing/close")}>
                <span>
                  <Landmark size={16} />
                </span>
                <b>ปิดยอดวัน</b>
                {store.biz.closings.some((c) => c.date === today) ? <small>ปิดแล้ว</small> : <em>ยังไม่ปิด</em>}
              </button>
              <button type="button" style={{ ["--mc" as string]: "#7c5cc4" }} onClick={() => navigate("/billing/commission")}>
                <span>
                  <HandCoins size={16} />
                </span>
                <b>ค่ามือผู้บำบัด</b>
                <small>รายเดือน</small>
              </button>
              <button type="button" style={{ ["--mc" as string]: "#d08a3c" }} onClick={() => navigate("/packages")}>
                <span>
                  <ShoppingBag size={16} />
                </span>
                <b>แพ็กเกจ</b>
                <small>{store.biz.packages.filter((x) => x.active).length} แพ็กเกจ</small>
              </button>
              <button type="button" style={{ ["--mc" as string]: "#0f766e" }} onClick={() => navigate("/inventory")}>
                <span>
                  <Boxes size={16} />
                </span>
                <b>คลังสินค้า</b>
                {(() => {
                  const low = store.biz.items.filter((i) => i.stock <= i.min).length;
                  return low ? <em>ใกล้หมด {low} รายการ</em> : <small>ปกติ</small>;
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
              <button type="button" onClick={() => setSel(null)}>
                <span className="bl-mi bl-mi--due">
                  <Wallet size={15} />
                </span>
                <b>{counterDue}</b>
                <small>ที่เคาน์เตอร์</small>
              </button>
              <button type="button" onClick={() => setSel(null)}>
                <span className="bl-mi bl-mi--app">
                  <Smartphone size={15} />
                </span>
                <b>{pendingApp.length}</b>
                <small>ในแอป · {baht(pendingApp.reduce((n, a) => n + a.payment!.amount, 0))} ฿</small>
              </button>
            </div>
          </section>
        </aside>
        
        );
        const histNode = (

        <div className="panel plist bl3__list">
          {tab === "history" && (
            <div className="bl3__tools">
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
              <div className="bl-chips">
                {(["all", "cash", "promptpay", "app", "credit"] as const).map((m) => (
                  <button key={m} type="button" aria-pressed={method === m} onClick={() => setMethod(m)}>
                    {m === "all" ? "ทุกช่องทาง" : METHOD_LABEL[m]}
                  </button>
                ))}
              </div>
              <span className="bl-sum">
                รวม <b>{baht(history.filter((e) => e.pay.status === "paid").reduce((n, e) => n + e.pay.amount, 0))}</b> บาท · {history.length} รายการ
              </span>
            </div>
          )}
          <div className="plist__items scroll-y">
            {tab === "due" &&
              (due.length ? (
                  due.map(dueRow)
              ) : (
                <EmptyState onGlass icon={<Hourglass size={24} />} title="ไม่มีบิลรอชำระ" description="ผู้ป่วยที่นวดเสร็จจะแสดงที่นี่" />
              ))}
            {tab === "history" &&
              (groups.length ? (
                groups.map(([d, list]) => (
                  <section key={d} className="bl3__group">
                    <p className="bl3__day">
                      {d === today ? "วันนี้" : thaiDateLong(d)}
                      <span>{baht(list.filter((e) => e.pay.status === "paid").reduce((n, e) => n + e.pay.amount, 0))} บาท</span>
                    </p>
                      {list.map(({ a, pay, key }) => {
                        const p = store.patientById(a.patientId);
                        const Ic = ICON[pay.method];
                        const tone = pay.status === "void" ? "neutral" : pay.status === "pending" ? "info" : "success";
                        return (
                          <button key={key} type="button" className={clsx("prow bl3-row bl3-rc", pay.status === "void" && "is-void", pay.status === "pending" && "is-pending")} aria-pressed={shown === a.id} onClick={() => openBill(a.id)}>
                            {shown === a.id && <motion.span layoutId="bill-sel" className="prow__sel" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                            <Avatar name={p.name} src={patientPhoto(p)} shape="squircle" />
                            <span className="prow__id">
                              <b>{p.name}</b>
                              <small>
                                {store.serviceById(a.serviceId).short} · {time(pay.at)} น. · {pay.no}
                              </small>
                              <span className="prow__chips">
                                <Badge tone={tone} compact>
                                  <Ic size={11} /> {pay.status === "void" ? (pay.voided?.refund ? "ยกเลิก · คืนเงิน" : "ยกเลิก") : pay.status === "pending" ? "รอชำระในแอป" : METHOD_LABEL[pay.method]}
                                </Badge>
                                {pay.slipSentAt && pay.status === "paid" && <CheckCheck size={13} className="bl3__sent" aria-label="ส่งสลิปเข้าแอปแล้ว" />}
                              </span>
                            </span>
                            <span className="prow__meta">
                              <span className="prow__next bl3__amt">
                                {pay.method === "credit" ? "1" : baht(pay.amount)}
                                <small>{pay.method === "credit" ? "ครั้ง" : "บาท"}</small>
                              </span>
                            </span>
                          </button>
                        );
                      })}
                  </section>
                ))
              ) : (
                <EmptyState onGlass icon={<ReceiptText size={24} />} title="ไม่มีรายการในช่วงนี้" description="ลองเปลี่ยนช่วงเวลาหรือช่องทาง" />
              ))}
          </div>
        </div>
        
        );
        const detailNode = (
          <>
        {/* คอลัมน์ขวา: รายละเอียดบิลที่เลือก (ไม่ต้องเปิดหน้าใหม่) */}
        {/* 2 ชั้นแบบหน้าผู้ป่วย: กรอบกระจก (panel) → แผ่นขาว (sheet) */}
        <div className="panel pdetail bl3__detail">
          <div className="sheet">
            {shown ? (
              <BillPanel key={shown} id={shown} compact />
            ) : (
              <div className="bl3__empty">
                <EmptyState icon={<ReceiptText size={24} />} title="เลือกบิลทางซ้าย" description="รายละเอียดบิลจะแสดงที่นี่" />
              </div>
            )}
          </div>
        </div>
          </>
        );
        const listNode = hist ? histNode : railNode;
        // จอกว้าง: ลาก ••• ปรับขนาด/ย้ายได้ เหมือนหน้าผู้ป่วย · จอแคบ: เรียงแบบเดิม
        return wide ? (
          <Workspace
            storageKey={hist ? "thaiwell.billing.history.layout" : "thaiwell.billing.layout"}
            flexMin={460}
            className={clsx("bl3 bl3--ws", hist && "bl3--hist", solo && "is-solo")}
            panes={[
              // รายชื่อ: ล็อก 300px เหมือนหน้าผู้ป่วย
              ...(solo ? [] : [{ id: "list", width: 300, fixed: true, node: listNode }]),
              // รายละเอียดบิล: ลาก ••• ที่ขอบปรับความกว้างได้ (ค่าเริ่ม = เต็มพื้นที่ที่เหลือ) · ขยายเต็มจอได้
              {
                id: "detail",
                actions: (
                  <button type="button" className="ws__icon" onClick={() => setSolo((v) => !v)} aria-label={solo ? "แสดงรายชื่อ" : "ขยายเต็มจอ"} title={solo ? "แสดงรายชื่อ" : "ขยายเต็มจอ"}>
                    {solo ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                  </button>
                ),
                node: detailNode,
              },
              // ที่ว่างที่เหลือ (เห็นห้องด้านหลัง) เมื่อย่อแผงรายละเอียด
              { id: "room", ghost: true, width: 1, min: 1, max: 640, node: <div /> },
            ]}
          />
        ) : (
          <div className={clsx("appt bl3", hist && "bl3--hist")}>
            {listNode}
            {detailNode}
          </div>
        );
      })()}

      <AppointmentDrawer id={open} startPay onClose={() => setOpen(null)} />
      <ReceiptDialog id={receipt} onClose={() => setReceipt(null)} />
      <ReportDialog open={report} onClose={() => setReport(false)} />
    </WorkPage>
  );
}
