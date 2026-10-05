import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BarChart3, FileSpreadsheet, Banknote, CheckCheck, ChevronRight, Hourglass, QrCode, ReceiptText, Smartphone, Ticket, Wallet } from "lucide-react";
import { clsx } from "clsx";
import { useStore } from "../../store/store";
import { Avatar, Badge, Button, EmptyState, IconButton, SearchField, Segmented } from "../../design-system";
import { WorkPage } from "../../layout/WorkPage";
import { AppointmentDrawer, stageOf } from "../../features/AppointmentDrawer";
import { ReceiptDialog } from "../../features/Receipt";
import { METHOD_LABEL } from "../../features/billing";
import { patientPhoto } from "../../data/avatars";
import { addISODays, baht, thaiDate, thaiDateLong, todayISO } from "../../data/thaiDate";
import type { Appointment, PaymentMethod } from "../../data/types";
import "../appointments/appointments.css";
import { ReportDialog, downloadCsv } from "../../features/ReportDialog";
import "./billing.css";

type Tab = "due" | "history";
type Range = "today" | "7" | "30";
const ICON: Record<PaymentMethod, typeof Banknote> = { cash: Banknote, promptpay: QrCode, app: Smartphone, credit: Ticket };
const time = (iso: string) => new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });

/** คิดเงิน — bills waiting at the counter, and the payment/receipt history. */
export default function Billing() {
  const store = useStore();
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
  const history = useMemo(
    () =>
      store.appointments
        .filter((a) => a.payment && a.payment.at.slice(0, 10) >= from && a.payment.at.slice(0, 10) <= today)
        .filter((a) => method === "all" || a.payment!.method === method)
        .filter(match)
        .sort((a, b) => b.payment!.at.localeCompare(a.payment!.at)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store.appointments, from, method, query],
  );
  const groups = useMemo(() => {
    const m = new Map<string, Appointment[]>();
    for (const a of history) {
      const d = a.payment!.at.slice(0, 10);
      if (!m.has(d)) m.set(d, []);
      m.get(d)!.push(a);
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
  const max = Math.max(1, ...(["cash", "promptpay"] as PaymentMethod[]).map((m) => byMethod(m).reduce((n, a) => n + a.payment!.amount, 0)));

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
                  ...history.map((a) => {
                    const p = store.patientById(a.patientId);
                    return [a.payment!.no, a.payment!.at.slice(0, 10), time(a.payment!.at), p.hn, p.name, store.serviceById(a.serviceId).name, METHOD_LABEL[a.payment!.method], a.payment!.status === "paid" ? "ชำระแล้ว" : "รอชำระในแอป", a.payment!.amount];
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
        <aside className="appt__rail scroll-y">
          <div className="rail-card bl-today">
            <div className="rail-card__head">
              <b>รายรับวันนี้</b>
              <span className="tw-meta">{thaiDate(today)}</span>
            </div>
            <div className="bl-income">
              {baht(income)}
              <small> บาท</small>
            </div>
            <span className="tw-meta">{paidToday.length} ใบเสร็จ</span>
            <div className="bl-split">
              {(["cash", "promptpay"] as PaymentMethod[]).map((m) => {
                const sum = byMethod(m).reduce((n, a) => n + a.payment!.amount, 0);
                const Ic = ICON[m];
                return (
                  <div key={m} className="bl-split__row">
                    <span className={`bl-mi bl-mi--${m}`}>
                      <Ic size={15} />
                    </span>
                    <span className="bl-split__label">
                      {METHOD_LABEL[m]}
                      <small>{byMethod(m).length} รายการ</small>
                    </span>
                    <b>{baht(sum)}</b>
                    <i>
                      <motion.i initial={{ width: 0 }} animate={{ width: `${(sum / max) * 100}%` }} className={`bl-bar--${m}`} />
                    </i>
                  </div>
                );
              })}
              <div className="bl-split__row">
                <span className="bl-mi bl-mi--credit">
                  <Ticket size={15} />
                </span>
                <span className="bl-split__label">
                  หักเครดิตคอร์ส
                  <small>ไม่มีรายรับเงินสด</small>
                </span>
                <b>{byMethod("credit").length} ครั้ง</b>
              </div>
            </div>
          </div>
          <div className="rail-card">
            <div className="rail-card__head">
              <b>รอชำระ</b>
            </div>
            <button type="button" className="bl-due" onClick={() => setTab("due")}>
              <span className="bl-mi bl-mi--due">
                <Wallet size={15} />
              </span>
              <span>
                ที่เคาน์เตอร์
                <small>รักษาเสร็จแล้ว รอคิดเงิน</small>
              </span>
              <b>{counterDue}</b>
            </button>
            <button type="button" className="bl-due" onClick={() => setTab("due")}>
              <span className="bl-mi bl-mi--app">
                <Smartphone size={15} />
              </span>
              <span>
                บิลในแอป ThaiWell AI
                <small>{baht(pendingApp.reduce((n, a) => n + a.payment!.amount, 0))} บาท ยังไม่จ่าย</small>
              </span>
              <b>{pendingApp.length}</b>
            </button>
          </div>
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
                  รวม <b>{baht(history.filter((a) => a.payment!.status === "paid").reduce((n, a) => n + a.payment!.amount, 0))}</b> บาท · {history.length} รายการ
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
                      <button key={a.id} type="button" className="bl-row" onClick={() => setOpen(a.id)}>
                        <Avatar name={p.name} src={patientPhoto(p)} size="md" shape="squircle" />
                        <span className="bl-row__who">
                          <b>{p.name}</b>
                          <small>
                            {s.name} · {thaiDate(a.date)} {a.start} น.
                          </small>
                        </span>
                        <Badge tone={pending ? "info" : stageOf(a) === "billing" ? "warning" : "danger"} compact>
                          {pending ? "รอชำระในแอป" : stageOf(a) === "billing" ? "รอคิดเงิน" : "ค้างชำระ"}
                        </Badge>
                        <b className="bl-amt">{baht(a.payment?.amount ?? s.price)} ฿</b>
                        <ChevronRight size={16} className="bl-chev" />
                      </button>
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
                        <span>{baht(list.filter((a) => a.payment!.status === "paid").reduce((n, a) => n + a.payment!.amount, 0))} บาท</span>
                      </p>
                      {list.map((a) => {
                        const p = store.patientById(a.patientId);
                        const pay = a.payment!;
                        const Ic = ICON[pay.method];
                        return (
                          <button key={a.id} type="button" className="bl-row" onClick={() => setReceipt(a.id)}>
                            <span className={clsx("bl-mi", `bl-mi--${pay.method}`)}>
                              <Ic size={16} />
                            </span>
                            <span className="bl-row__who">
                              <b>{p.name}</b>
                              <small>
                                {pay.no} · {time(pay.at)} น. · {store.serviceById(a.serviceId).short}
                              </small>
                            </span>
                            {pay.slipSentAt && (
                              <span className="bl-sent" title="ส่งสลิปเข้าแอปแล้ว">
                                <CheckCheck size={13} /> ส่งสลิปแล้ว
                              </span>
                            )}
                            <Badge tone={pay.status === "pending" ? "info" : "neutral"} compact>
                              {pay.status === "pending" ? "รอชำระในแอป" : METHOD_LABEL[pay.method]}
                            </Badge>
                            <b className="bl-amt">{baht(pay.amount)} ฿</b>
                            <ReceiptText size={16} className="bl-chev" />
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

      <AppointmentDrawer id={open} onClose={() => setOpen(null)} />
      <ReceiptDialog id={receipt} onClose={() => setReceipt(null)} />
      <ReportDialog open={report} onClose={() => setReport(false)} />
    </WorkPage>
  );
}
