import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Building2, CalendarCheck2, CheckCircle2, Cloud, CreditCard, Loader2, MapPin, RotateCcw, Send, Smartphone, Ticket } from "lucide-react";
import { clsx } from "clsx";
import { Button } from "../../design-system";
import { WorkPage } from "../../layout/WorkPage";
import { addISODays, todayISO } from "../../data/thaiDate";
import { FLOW, STATUS_TH, cloud, logEvent, updateAppt, type CloudAppt, type CloudEvent } from "../../sync/cloud";
import { useStore } from "../../store/store";
import { DEFAULT_SETTINGS } from "../../data/seed";
import { DEMO_APP_USER, resetBothSystems } from "../../sync/demo";
import { DEMO } from "../../data/mode";
import "./flow.css";

const SIM = DEMO_APP_USER;
const time = (iso: string) => new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/**
 * /flow — the prototype of the connected system: a patient-app simulator on the left, the shared cloud in the middle
 * (every hand-off, live) and where each booking is on the right. The real patient app writes the same tables.
 */
export default function Flow() {
  const store = useStore();
  const [events, setEvents] = useState<CloudEvent[]>([]);
  const [appts, setAppts] = useState<CloudAppt[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const [form, setForm] = useState({ complaint: "ปวดคอ บ่า ไหล่ขวา ตึงมาก", pain: 7, service: "นวดไทยเพื่อการรักษา", date: addISODays(todayISO(), 0), start: "14:00" });
  const fresh = useRef(new Set<number>());
  const [again, setAgain] = useState(false); // patient chose to book again after the last visit was paid

  const load = async () => {
    const [{ data: ev, error }, { data: ap }] = await Promise.all([
      cloud.from("tw_events").select("*").gt("id", 0).order("id", { ascending: false }).limit(60),
      cloud.from("tw_appointments").select("*, tw_patients(*)").order("created_at", { ascending: false }).limit(20),
    ]);
    setOnline(!error);
    setEvents((ev as CloudEvent[]) ?? []);
    setAppts((ap as CloudAppt[]) ?? []);
  };
  useEffect(() => {
    void load();
    const ch = cloud
      .channel("tw-flow")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "tw_events" }, (e) => {
        const ev = e.new as CloudEvent;
        if (ev.id < 0) return;
        fresh.current.add(ev.id);
        setEvents((x) => [ev, ...x].slice(0, 60));
        window.setTimeout(() => fresh.current.delete(ev.id), 2500);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "tw_appointments" }, () => void load())
      .subscribe((s) => s === "SUBSCRIBED" && setOnline(true));
    return () => void cloud.removeChannel(ch);
  }, []);

  const mine = appts.filter((a) => a.patient_id === SIM.id);
  const current = mine[0];

  // ── patient-app actions (the same writes the real app makes) ──
  const book = async () => {
    setBusy("book");
    try {
      await cloud.from("tw_patients").upsert({ id: SIM.id, name: SIM.name, phone: SIM.phone, gender: SIM.gender, age: SIM.age });
      const id = `bk${Date.now().toString(36)}`;
      await cloud.from("tw_appointments").insert({
        id,
        patient_id: SIM.id,
        status: "requested",
        service: form.service,
        date: form.date,
        start: form.start,
        assessment: { complaint: form.complaint, pain: form.pain, areas: ["คอ", "บ่า", "ไหล่"], avoid: [], conditions: [], pressure: "ปานกลาง", screening: { fever: false, highBP: false }, summary: `AI ประเมิน: ${form.complaint} · ปวด ${form.pain}/10 · ไม่พบข้อห้าม` },
      });
      setAgain(false);
      await logEvent("app", "booking.requested", { id }, SIM.name, `ประเมินอาการแล้ว ส่งคำขอจอง ${form.service} ${form.date} ${form.start} น.`);
    } finally {
      setBusy(null);
    }
  };
  const checkIn = async () => {
    if (!current) return;
    setBusy("in");
    await updateAppt(current.id, { status: "checked_in" });
    await logEvent("app", "visit.checked_in", current, SIM.name, "มาถึงคลินิก กดเช็กอินในแอป");
    setBusy(null);
  };
  const pay = async () => {
    if (!current?.bill) return;
    setBusy("pay");
    await updateAppt(current.id, { status: "paid", bill: { ...current.bill, status: "paid", method: "app", via: "app", paid_at: new Date().toISOString() } });
    await logEvent("app", "bill.paid", current, SIM.name, `ชำระ ${current.bill.amount} บาท ผ่านแอป (พร้อมเพย์)`);
    setBusy(null);
  };
  const cancel = async () => {
    if (!current) return;
    await updateAppt(current.id, { status: "cancelled", note: "ผู้ป่วยยกเลิกจากแอป" });
    await logEvent("app", "booking.cancelled", current, SIM.name, "ผู้ป่วยยกเลิกนัดจากแอป");
  };
  const reset = () => {
    if (!window.confirm("รีเซ็ตข้อมูลสาธิตทั้ง 2 ระบบ? (หลังบ้าน + cloud · แอปบนมือถือให้ปิดแล้วเปิดใหม่)")) return;
    resetBothSystems(store.dispatch, DEFAULT_SETTINGS.clinicName);
  };

  const stages = useMemo(() => FLOW.filter((s) => s !== "closed"), []);
  const at = current ? Math.max(0, stages.indexOf(current.status as (typeof stages)[number])) : -1;

  return (
    <WorkPage
      eyebrow="ต้นแบบการเชื่อมต่อ"
      title="Flow Monitor"
      bell={false}
      actions={
        <>
          <span className={clsx("fl-online", online && "is-on")}>
            <i /> {online === null ? "กำลังเชื่อมต่อ…" : online ? "เชื่อมต่อ Supabase แล้ว" : "เชื่อมต่อไม่ได้"}
          </span>
          {DEMO && (
            <Button variant="white" size="md" leading={<RotateCcw size={15} />} onClick={reset}>
              รีเซ็ตข้อมูลสาธิต
            </Button>
          )}
        </>
      }
    >
      <div className={clsx("fl", !DEMO && "fl--live")}>
        {/* patient app simulator (สาธิต/ทดสอบเท่านั้น — ใช้งานจริงข้อมูลมาจากแอปจริง) */}
        {DEMO && <section className="fl-phone">
          <header>
            <Smartphone size={16} /> แอปผู้รับบริการ <small>(จำลอง)</small>
          </header>
          <div className="fl-screen scroll-y scroll-y--light">
            <div className="fl-who">
              <b>{SIM.name}</b>
              <small>{SIM.phone}</small>
            </div>
            {!current || again || ["closed", "rejected", "cancelled"].includes(current.status) ? (
              <div className="fl-card">
                <h4>
                  <CalendarCheck2 size={15} /> ประเมินอาการแล้วจองคิว
                </h4>
                <label>
                  อาการ
                  <textarea rows={2} value={form.complaint} onChange={(e) => setForm({ ...form, complaint: e.target.value })} />
                </label>
                <label>
                  ระดับปวด {form.pain}/10
                  <input type="range" min={0} max={10} value={form.pain} onChange={(e) => setForm({ ...form, pain: Number(e.target.value) })} />
                </label>
                <label>
                  บริการ
                  <select value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })}>
                    <option>นวดไทยเพื่อการรักษา</option>
                    <option>นวดไทยเพื่อสุขภาพ</option>
                    <option>ประคบสมุนไพร</option>
                  </select>
                </label>
                <div className="fl-row">
                  <label>
                    วันที่
                    <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                  </label>
                  <label>
                    เวลา
                    <input type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
                  </label>
                </div>
                <Button size="md" block leading={busy === "book" ? <Loader2 size={15} className="spin" /> : <Send size={15} />} disabled={!!busy} onClick={book}>
                  ส่งคำขอจอง
                </Button>
                {current && <p className="fl-muted">นัดล่าสุด: {STATUS_TH[current.status]}</p>}
              </div>
            ) : (
              <div className="fl-card">
                <h4>
                  <Ticket size={15} /> นัดของฉัน · {STATUS_TH[current.status]}
                </h4>
                <p className="fl-big">
                  {current.service}
                  <small>
                    {current.date} · {current.start} น.{current.therapist ? ` · ${current.therapist}` : ""}
                  </small>
                </p>
                {current.status === "requested" && <p className="fl-wait">รอคลินิกยืนยันการจอง…</p>}
                {current.status === "confirmed" && (
                  <>
                    <p className="fl-ok">คลินิกยืนยันนัดแล้ว · มาถึงแล้วกดเช็กอิน</p>
                    <Button size="md" block leading={<MapPin size={15} />} disabled={!!busy} onClick={checkIn}>
                      เช็กอิน
                    </Button>
                  </>
                )}
                {current.queue_no && ["checked_in", "called", "in_service"].includes(current.status) && (
                  <div className={clsx("fl-queue", current.status === "called" && "is-called")}>
                    <small>เลขคิวของคุณ</small>
                    <b>{current.queue_no}</b>
                    <em>{current.status === "called" ? "ถึงคิวแล้ว เชิญเข้ารับบริการ" : current.status === "in_service" ? "กำลังรับบริการ" : "รอเรียกคิว…"}</em>
                  </div>
                )}
                {current.record && (
                  <div className="fl-rec">
                    <small>ผลการรักษา</small>
                    <p>
                      ปวด {current.record.painBefore} → <b>{current.record.painAfter}</b>
                    </p>
                    {current.record.diagnoses?.length ? <p>วินิจฉัย: {current.record.diagnoses.join(", ")}</p> : null}
                    {current.record.procedures?.length ? <p>หัตถการ: {current.record.procedures.join(" / ")}</p> : null}
                    {current.record.advice && <p className="fl-adv">“{current.record.advice}”</p>}
                  </div>
                )}
                {current.bill?.status === "pending" && (
                  <div className="fl-bill">
                    <small>บิลจากคลินิก</small>
                    <b>{current.bill.amount} บาท</b>
                    <Button size="md" block leading={<CreditCard size={15} />} disabled={!!busy} onClick={pay}>
                      ชำระผ่านแอป
                    </Button>
                  </div>
                )}
                {current.plan && (
                  <div className="fl-rec">
                    <small>แผนการรักษาจากแพทย์</small>
                    <p>
                      {current.plan.sessions} ครั้ง · {current.plan.frequency}
                    </p>
                    <p>{current.plan.summary}</p>
                  </div>
                )}
                {["requested", "confirmed"].includes(current.status) && (
                  <button type="button" className="fl-link" onClick={cancel}>
                    ยกเลิกนัด
                  </button>
                )}
              </div>
            )}
            {current?.status === "paid" && !again && (
              <>
                <p className="fl-ok">
                  <CheckCircle2 size={14} /> ชำระแล้ว {current.bill?.amount} บาท · {current.bill?.via === "app" ? "ผ่านแอป" : "ที่คลินิก"}
                  {current.bill?.receipt_no ? ` · ใบเสร็จ ${current.bill.receipt_no}` : ""}
                </p>
                <Button variant="white" size="md" block leading={<CalendarCheck2 size={15} />} onClick={() => setAgain(true)}>
                  จัดนัดครั้งถัดไป
                </Button>
              </>
            )}
          </div>
        </section>}

        {/* the shared cloud: every hand-off */}
        <section className="fl-stream">
          <header>
            <Cloud size={16} /> ข้อมูลที่วิ่งผ่าน Supabase <small>สด</small>
          </header>
          {current && (
            <ol className="fl-steps">
              {stages.map((s, i) => (
                <li key={s} className={clsx(i < at && "is-done", i === at && "is-now")}>
                  <i />
                  <span>{STATUS_TH[s]}</span>
                </li>
              ))}
            </ol>
          )}
          <div className="fl-events scroll-y scroll-y--light">
            <AnimatePresence initial={false}>
              {events.map((e) => (
                <motion.div key={e.id} layout initial={{ opacity: 0, y: -10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} className={clsx("fl-ev", `is-${e.source}`, fresh.current.has(e.id) && "is-fresh")}>
                  <span className="fl-ev__dir">
                    {e.source === "system" ? (
                      <>
                        <Cloud size={13} /> ระบบ
                      </>
                    ) : e.source === "app" ? (
                      <>
                        <Smartphone size={13} /> แอป <ArrowRight size={13} /> <Building2 size={13} /> คลินิก
                      </>
                    ) : (
                      <>
                        <Smartphone size={13} /> แอป <ArrowLeft size={13} /> <Building2 size={13} /> คลินิก
                      </>
                    )}
                  </span>
                  <b>{e.summary}</b>
                  <small>
                    {time(e.at)} · {e.kind}
                    {e.patient_name ? ` · ${e.patient_name}` : ""}
                  </small>
                </motion.div>
              ))}
            </AnimatePresence>
            {!events.length && <p className="fl-muted">ยังไม่มีข้อมูลวิ่ง · ลองกด “ส่งคำขอจอง” ในแอปจำลอง แล้วไปยืนยันที่หน้า “คำขอจองคิว”</p>}
          </div>
        </section>

        {/* where each booking is */}
        <section className="fl-board">
          <header>
            <Building2 size={16} /> สถานะการจองในระบบ
          </header>
          <div className="fl-list scroll-y scroll-y--light">
            {appts.map((a) => (
              <div key={a.id} className="fl-item">
                <span>
                  <b>{a.tw_patients?.name ?? a.patient_id}</b>
                  <small>
                    {a.service} · {a.date} {a.start}
                    {a.queue_no ? ` · คิว ${a.queue_no}` : ""}
                  </small>
                </span>
                <em className={`is-${a.status}`}>{STATUS_TH[a.status] ?? a.status}</em>
              </div>
            ))}
            {!appts.length && <p className="fl-muted">ยังไม่มีการจองใน cloud</p>}
          </div>
          <div className="fl-how">
            <b>ฝั่งคลินิกทำต่อที่</b>
            <span>คำขอจองคิว → อนุมัติ · รับบริการ → เรียกคิว / เริ่ม / บันทึกการรักษา · คิดเงิน → ส่งบิลในแอป หรือรับชำระ</span>
          </div>
        </section>
      </div>
    </WorkPage>
  );
}
