import { useEffect, useMemo, useState } from "react";
import { CalendarCheck, CalendarClock, CalendarX2, Check, CircleAlert } from "lucide-react";
import { clsx } from "clsx";
import { useStore } from "../store/store";
import { Avatar, Button, Dialog, Field, Input, useToast } from "../design-system";
import { CalendarPicker } from "./CalendarPicker";
import { therapistPhoto } from "../data/avatars";
import { blocksOn } from "../data/domain";
import { fromISODate, fromMinutes, thaiDateLong, toMinutes, todayISO } from "../data/thaiDate";
import type { DayBlock } from "../data/types";
import { BlockEditor, dayError } from "./ShiftEditor";
import "./shift-editor.css";

type Mode = "weekly" | "leave" | "custom";
const REASONS = ["ลาป่วย", "ลากิจ", "ลาพักร้อน", "อบรม / ประชุม"];

export interface DayTarget {
  therapistId: string;
  date: string;
}

/** One-off change for a single date: leave, or different hours — the weekly schedule stays as is. */
export function DayEditor({ target, onClose }: { target: DayTarget | null; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const [shown, setShown] = useState(target);
  if (target && target !== shown) setShown(target);
  const t = shown ? store.therapistById(shown.therapistId) : null;
  const [date, setDate] = useState(shown?.date ?? "");

  const [mode, setMode] = useState<Mode>("weekly");
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState("");
  const [blocks, setBlocks] = useState<DayBlock[]>([]);

  // weekly blocks for this date, ignoring any exception
  const weekly = useMemo(() => (t ? blocksOn({ ...t, exceptions: undefined }, date) : []), [t, date]);

  useEffect(() => {
    if (target) setDate(target.date);
  }, [target]);

  // load whatever is saved for the chosen date
  useEffect(() => {
    if (!target || !date) return;
    const th = store.therapistById(target.therapistId);
    const ex = th.exceptions?.[date];
    const base = blocksOn({ ...th, exceptions: undefined }, date);
    setMode(ex ? ex.kind : "weekly");
    setReason(ex?.reason ?? REASONS[0]);
    setNote(ex?.note ?? "");
    setBlocks(ex?.kind === "custom" ? ex.blocks.map((b) => ({ ...b, services: [...b.services] })) : base.map((b) => ({ ...b, services: [...b.services] })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, date]);

  const next = mode === "leave" ? [] : mode === "custom" ? blocks : weekly;
  // booked queues that would fall outside the hours/services for this date
  const affected = useMemo(() => {
    if (!t) return 0;
    return store.appointments.filter(
      (a) =>
        a.therapistId === t.id &&
        a.date === date &&
        (a.status === "waiting" || a.status === "active") &&
        !next.some((b) => a.start >= b.start && a.start < b.end && b.services.includes(a.serviceId)),
    ).length;
  }, [store.appointments, t, date, next]);

  const valid = mode !== "custom" || (blocks.length > 0 && !dayError(blocks));
  const fmt = (bs: DayBlock[]) => (bs.length ? bs.map((b) => `${b.start}–${b.end}`).join(", ") : "หยุด");

  const save = () => {
    if (!t || !valid) return;
    store.dispatch({
      type: "setException",
      id: t.id,
      date,
      exception:
        mode === "weekly"
          ? null
          : mode === "leave"
            ? { kind: "leave", reason, note: note.trim() || undefined, blocks: [] }
            : { kind: "custom", note: note.trim() || undefined, blocks },
    });
    toast({
      message:
        mode === "weekly" ? `${t.name} กลับไปใช้ตารางประจำแล้ว` : mode === "leave" ? `บันทึก${reason}ของ ${t.name} แล้ว` : `ปรับตารางเฉพาะวันของ ${t.name} แล้ว`,
    });
    onClose();
  };

  const { openTime, closeTime, closedWeekdays } = store.settings;
  const pct = (h: string) => ((toMinutes(h) - toMinutes(openTime)) / (toMinutes(closeTime) - toMinutes(openTime))) * 100;
  const ticks: string[] = [];
  for (let m = toMinutes(openTime); m <= toMinutes(closeTime); m += 120) ticks.push(fromMinutes(m));
  const line = (bs: DayBlock[], tone?: "leave") => (
    <div className={clsx("shift__track dayex__track", tone && "dayex__track--leave")}>
      {bs.map((b, i) => (
        <i key={i} className="shift__seg" style={{ left: `${pct(b.start)}%`, width: `${pct(b.end) - pct(b.start)}%` }}>
          {b.services.map((x) => store.serviceById(x).short).join(", ")}
        </i>
      ))}
      {!bs.length && <span className="dayex__none">{tone === "leave" ? reason : "ไม่เปิดให้จอง"}</span>}
    </div>
  );
  const MODES: { value: Mode; label: string; desc: string; icon: typeof CalendarCheck }[] = [
    { value: "weekly", label: "ตามตารางประจำ", desc: fmt(weekly), icon: CalendarCheck },
    { value: "leave", label: "ลา / หยุด", desc: "ไม่เปิดให้จองทั้งวัน", icon: CalendarX2 },
    { value: "custom", label: "ปรับเวลา", desc: "เปลี่ยนช่วงเวลาหรือบริการ", icon: CalendarClock },
  ];

  return (
    <Dialog
      open={target !== null}
      onClose={onClose}
      wide
      className="dayex-dialog"
      leading={t ? <Avatar name={t.name} src={therapistPhoto(t)} size="lg" color={t.color} /> : undefined}
      title={t ? `ปรับเฉพาะวัน · ${t.name}` : ""}
      subtitle="เปลี่ยนเฉพาะวันที่เลือก ตารางประจำไม่เปลี่ยน"
      footer={
        <>
          <Button variant="outline" size="lg" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button size="lg" disabled={!valid} leading={<Check size={16} />} onClick={save}>
            บันทึก
          </Button>
        </>
      }
    >
      {t && date && (
        <div className="dayex">
          {/* left: date + mode */}
          <aside className="dayex__side">
            <h3 className="dayex__h">1 · วันที่</h3>
            <CalendarPicker
              value={date}
              onChange={setDate}
              blocked={(d) => (d < todayISO() ? "วันที่ผ่านมาแล้ว" : closedWeekdays.includes(fromISODate(d).getDay()) ? "คลินิกปิดทำการ" : null)}
            />
            <h3 className="dayex__h">2 · รูปแบบ</h3>
            <div className="dayex__modes" role="radiogroup" aria-label="รูปแบบ">
              {MODES.map((m) => (
                <button key={m.value} type="button" role="radio" aria-checked={mode === m.value} className="dayex__mode" onClick={() => setMode(m.value)}>
                  <span className="dayex__mode-icon">
                    <m.icon size={18} strokeWidth={1.9} />
                  </span>
                  <span className="dayex__mode-text">
                    <b>{m.label}</b>
                    <small>{m.desc}</small>
                  </span>
                  <i className="shift__tick" aria-hidden>
                    <Check size={11} strokeWidth={3} />
                  </i>
                </button>
              ))}
            </div>
          </aside>

          {/* right: what that day looks like */}
          <section className="dayex__main">
            <div className="dayex__head">
              <h3>{thaiDateLong(date)}</h3>
              {t.exceptions?.[date] && <em className="so-ex">มีการปรับไว้แล้ว</em>}
            </div>

            <div className="dayex__compare">
              <span className="dayex__label">ตารางประจำ</span>
              {line(weekly)}
              <span className="dayex__label dayex__label--now">วันที่เลือก</span>
              {line(next, mode === "leave" ? "leave" : undefined)}
              <span />
              <div className="shift__ticks">
                {ticks.map((h) => (
                  <span key={h} style={{ left: `${pct(h)}%` }}>
                    {h.replace(":00", "")}
                  </span>
                ))}
              </div>
            </div>

            {mode === "weekly" && <p className="shift__empty">ใช้ตารางประจำ · เลือก "ลา / หยุด" หรือ "ปรับเวลา" เพื่อเปลี่ยน</p>}

            {mode === "leave" && (
              <div className="tw-field">
                <span className="tw-field__label">เหตุผล</span>
                <div className="dayex__reasons">
                  {REASONS.map((r) => (
                    <button key={r} type="button" className="shift__daychip" aria-pressed={reason === r} onClick={() => setReason(r)}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {mode === "custom" && <BlockEditor blocks={blocks} onChange={setBlocks} fallback={t.services} />}

            {mode !== "weekly" && (
              <Field label="หมายเหตุ (ไม่บังคับ)">
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === "leave" ? "เช่น ไปพบแพทย์" : "เช่น มีสอบช่วงบ่าย"} />
              </Field>
            )}

            {affected > 0 && (
              <div className="alert alert--caution">
                <CircleAlert size={16} />
                <div>
                  <b>มี {affected} นัดอยู่นอกเวลาใหม่</b>
                  นัดยังอยู่ · เปลี่ยนผู้บำบัดหรือเลื่อนนัดในตารางนัด
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </Dialog>
  );
}
