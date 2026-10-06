import { useMemo, useState } from "react";
import { BellRing, CalendarCheck2, Hourglass, Plus, X } from "lucide-react";
import { useStore } from "../store/store";
import { Avatar, Button, Dialog, Field, Input, Select, Textarea } from "../design-system";
import { patientPhoto } from "../data/avatars";
import { thaiDateShort, toMinutes, todayISO } from "../data/thaiDate";
import type { WaitEntry } from "../data/biz";
import "./waitlist.css";

type Store = ReturnType<typeof useStore>;

/** A slot was freed (cancellation): notify everyone waiting for that day whose time window covers it. Returns how many were notified. */
export function notifyWaitlist(store: Store, freed: { date: string; start: string; patientId: string }[]) {
  const hit = store.biz.waitlist.filter(
    (w) => w.status === "waiting" && freed.some((f) => f.date === w.date && f.patientId !== w.patientId && toMinutes(f.start) >= toMinutes(w.from) && toMinutes(f.start) <= toMinutes(w.to)),
  );
  if (!hit.length) return 0;
  const at = new Date().toISOString();
  const ids = new Set(hit.map((w) => w.id));
  store.dispatch({
    type: "biz",
    cat: "นัดหมาย",
    log: `มีคิวว่าง ${freed.map((f) => `${thaiDateShort(f.date)} ${f.start} น.`).join(", ")} · แจ้งคนรอคิวผ่านแอป ${hit.map((w) => store.patientById(w.patientId).name).join(", ")}`,
    update: (b) => ({ ...b, waitlist: b.waitlist.map((w) => (ids.has(w.id) ? { ...w, status: "notified", notifiedAt: at } : w)) }),
  });
  return hit.length;
}

/** Appointments rail: who is waiting for a slot, from the selected day on */
export function WaitlistCard({ date, onBook }: { date: string; onBook: (w: WaitEntry) => void }) {
  const store = useStore();
  const [adding, setAdding] = useState(false);
  const list = store.biz.waitlist.filter((w) => (w.status === "waiting" || w.status === "notified") && w.date >= todayISO()).sort((a, b) => (a.date + a.from).localeCompare(b.date + b.from));
  const remove = (w: WaitEntry) => store.dispatch({ type: "biz", cat: "นัดหมาย", patientId: w.patientId, log: `ถอนชื่อจากรายการรอคิว ${thaiDateShort(w.date)} · ${store.patientById(w.patientId).name}`, update: (b) => ({ ...b, waitlist: b.waitlist.map((x) => (x.id === w.id ? { ...x, status: "removed" } : x)) }) });
  return (
    <div className="rail-card wl">
      <div className="rail-card__head">
        <b>
          <Hourglass size={14} /> รายการรอคิว
        </b>
        <button type="button" className="rail-clear" onClick={() => setAdding(true)}>
          <Plus size={13} /> เพิ่ม
        </button>
      </div>
      {list.length ? (
        <div className="wl__list">
          {list.map((w) => {
            const p = store.patientById(w.patientId);
            return (
              <div key={w.id} className={`wl__row ${w.date === date ? "is-day" : ""}`}>
                <Avatar name={p.name} src={patientPhoto(p)} size="sm" />
                <span className="wl__main">
                  <b>{p.name}</b>
                  <small>
                    {thaiDateShort(w.date)} · {w.from}–{w.to} น. · {store.serviceById(w.serviceId).short}
                  </small>
                  {w.status === "notified" && (
                    <em>
                      <BellRing size={11} /> แจ้งคิวว่างแล้ว
                    </em>
                  )}
                </span>
                <span className="wl__acts">
                  <button type="button" className="wl__book" title="จองให้" aria-label={`จองให้ ${p.name}`} onClick={() => onBook(w)}>
                    <CalendarCheck2 size={15} />
                  </button>
                  <button type="button" className="wl__x" title="ถอนชื่อ" aria-label={`ถอนชื่อ ${p.name}`} onClick={() => remove(w)}>
                    <X size={14} />
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="wl__empty">ยังไม่มีคนรอคิว · เมื่อมีคนยกเลิกนัด ระบบจะแจ้งคนที่รอในช่วงเวลานั้นให้อัตโนมัติ</p>
      )}
      <WaitAddDialog open={adding} date={date} onClose={() => setAdding(false)} />
    </div>
  );
}

function WaitAddDialog({ open, date, onClose }: { open: boolean; date: string; onClose: () => void }) {
  const store = useStore();
  const [q, setQ] = useState("");
  const blank = () => ({ patientId: "", serviceId: store.services[0].id, date: date < todayISO() ? todayISO() : date, from: store.settings.openTime, to: store.settings.closeTime, note: "" });
  const [f, setF] = useState(blank);
  const found = useMemo(() => {
    const k = q.trim().toLowerCase();
    return k ? store.patients.filter((p) => `${p.name} ${p.hn} ${p.phone}`.toLowerCase().includes(k)).slice(0, 6) : [];
  }, [q, store.patients]);
  const picked = f.patientId ? store.patientById(f.patientId) : null;
  const close = () => {
    setF(blank());
    setQ("");
    onClose();
  };
  const save = () => {
    const w: WaitEntry = { id: `wl${Date.now().toString(36)}`, at: new Date().toISOString(), ...f, note: f.note.trim() || undefined, status: "waiting" };
    store.dispatch({ type: "biz", cat: "นัดหมาย", patientId: f.patientId, log: `เพิ่มรายการรอคิว ${picked!.name} · ${thaiDateShort(f.date)} ${f.from}–${f.to} น.`, update: (b) => ({ ...b, waitlist: [...b.waitlist, w] }) });
    close();
  };
  return (
    <Dialog
      open={open}
      onClose={close}
      title="เพิ่มรายการรอคิว"
      subtitle="ถ้ามีคนยกเลิกในช่วงเวลานี้ ระบบจะแจ้งผ่านแอป ThaiWell AI"
      footer={
        <>
          <Button variant="outline" size="md" onClick={close}>
            ยกเลิก
          </Button>
          <Button size="md" disabled={!picked || f.from >= f.to} onClick={save}>
            เพิ่มเข้ารายการ
          </Button>
        </>
      }
    >
      <div className="bz-form">
        {/* not a <Field>: a <label> would swallow taps on the result buttons */}
        <div className="tw-field span-2">
          <span className="tw-field__label">ผู้รับบริการ</span>
          {picked ? (
            <div className="wl__picked">
              <Avatar name={picked.name} src={patientPhoto(picked)} size="sm" />
              <b>{picked.name}</b>
              <small>{picked.hn}</small>
              <button type="button" onClick={() => setF({ ...f, patientId: "" })}>
                เปลี่ยน
              </button>
            </div>
          ) : (
            <>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อ HN หรือเบอร์โทร" autoFocus />
              {found.length > 0 && (
                <div className="wl__found">
                  {found.map((p) => (
                    <button key={p.id} type="button" onClick={() => setF({ ...f, patientId: p.id })}>
                      <Avatar name={p.name} src={patientPhoto(p)} size="xs" />
                      {p.name} <small>{p.hn}</small>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <Field label="บริการ">
          <Select value={f.serviceId} onChange={(e) => setF({ ...f, serviceId: e.target.value })}>
            {store.services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="วันที่ต้องการ">
          <Input type="date" min={todayISO()} value={f.date} onChange={(e) => e.target.value && setF({ ...f, date: e.target.value })} />
        </Field>
        <Field label="ตั้งแต่">
          <Input type="time" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
        </Field>
        <Field label="ถึง">
          <Input type="time" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
        </Field>
        <Field label="หมายเหตุ" className="span-2">
          <Textarea rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="เช่น สะดวกหลังเลิกงาน ขอผู้บำบัดหญิง" />
        </Field>
      </div>
    </Dialog>
  );
}
