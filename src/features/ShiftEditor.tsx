import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Footprints, HandHeart, Leaf, Plus, Sparkles, Stethoscope, Trash2 } from "lucide-react";
import { clsx } from "clsx";
import { useStore } from "../store/store";
import { Avatar, Button, Dialog, IconButton, Select, Switch, useToast } from "../design-system";
import { therapistPhoto } from "../data/avatars";
import { TH_WEEKDAYS, TH_WEEKDAYS_SHORT, fromMinutes, toMinutes } from "../data/thaiDate";
import type { Shift, Therapist } from "../data/types";
import "./shift-editor.css";

export interface Block {
  start: string;
  end: string;
  services: string[];
}

const ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first

/** shifts → blocks per weekday (index = day of week) */
const toDays = (t: Therapist): Block[][] =>
  Array.from({ length: 7 }, (_, d) =>
    t.shifts
      .filter((s) => s.days.includes(d))
      .map((s) => ({ start: s.start, end: s.end, services: [...s.services] }))
      .sort((a, b) => a.start.localeCompare(b.start)),
  );

/** blocks per weekday → shifts (identical blocks on several days are grouped) */
const toShifts = (days: Block[][]): Shift[] => {
  const m = new Map<string, Shift>();
  days.forEach((blocks, d) =>
    blocks.forEach((b) => {
      const k = `${b.start}-${b.end}-${[...b.services].sort().join(",")}`;
      if (!m.has(k)) m.set(k, { days: [], start: b.start, end: b.end, services: [...b.services].sort() });
      m.get(k)!.days.push(d);
    }),
  );
  return [...m.values()];
};

/** what's wrong with a day's blocks, or null */
export const dayError = (blocks: Block[]) => {
  if (blocks.some((b) => b.start >= b.end)) return "เวลาสิ้นสุดต้องหลังเวลาเริ่ม";
  if (blocks.some((b) => b.services.length === 0)) return "เลือกบริการอย่างน้อย 1 รายการ";
  const sorted = [...blocks].sort((a, b) => a.start.localeCompare(b.start));
  if (sorted.some((b, i) => i > 0 && b.start < sorted[i - 1].end)) return "ช่วงเวลาซ้อนกัน";
  return null;
};

export const hoursOf = (b: Block) => (toMinutes(b.end) - toMinutes(b.start) - (b.start < "12:00" && b.end > "12:00" ? 60 : 0)) / 60;

const nextBlock = (blocks: Block[], openTime: string, closeTime: string, fallback: string[]): Block => {
  const last = blocks[blocks.length - 1];
  if (!last) return { start: openTime, end: "12:00", services: [...fallback] };
  const start = last.end === "12:00" ? "13:00" : last.end;
  return { start, end: closeTime, services: [...last.services] };
};

const ICON: Record<string, typeof Sparkles> = { s1: HandHeart, s2: Stethoscope, s3: Leaf, s4: Footprints, s5: Sparkles };

/** Editable list of time blocks, each with its own services — shared by the weekly and the one-day editor. */
export function BlockEditor({ blocks, onChange, fallback }: { blocks: Block[]; onChange: (b: Block[]) => void; fallback: string[] }) {
  const store = useStore();
  const { openTime, closeTime } = store.settings;
  const hours: string[] = [];
  for (let m = toMinutes(openTime); m <= toMinutes(closeTime); m += 60) hours.push(fromMinutes(m));
  const setBlock = (bi: number, patch: Partial<Block>) => onChange(blocks.map((b, i) => (i === bi ? { ...b, ...patch } : b)));
  const err = dayError(blocks);
  return (
    <div className="shift__blocks">
      {blocks.map((b, bi) => (
        <div key={bi} className="shift__block">
          <div className="shift__block-head">
            <span className="shift__no">ช่วงที่ {bi + 1}</span>
            <div className="shift__time">
              <Select value={b.start} onChange={(e) => setBlock(bi, { start: e.target.value })} aria-label="เวลาเริ่ม">
                {hours.slice(0, -1).map((h) => (
                  <option key={h}>{h}</option>
                ))}
              </Select>
              <span>ถึง</span>
              <Select value={b.end} onChange={(e) => setBlock(bi, { end: e.target.value })} aria-label="เวลาสิ้นสุด">
                {hours.slice(1).map((h) => (
                  <option key={h} disabled={h <= b.start}>
                    {h}
                  </option>
                ))}
              </Select>
            </div>
            <IconButton label="ลบช่วงเวลา" variant="soft" size="sm" onClick={() => onChange(blocks.filter((_, i) => i !== bi))}>
              <Trash2 size={15} />
            </IconButton>
          </div>
          <div className="shift__svcs">
            {store.services.map((sv) => {
              const picked = b.services.includes(sv.id);
              const Ic = ICON[sv.id] ?? Sparkles;
              return (
                <button
                  key={sv.id}
                  type="button"
                  className="shift__svc"
                  aria-pressed={picked}
                  onClick={() => setBlock(bi, { services: picked ? b.services.filter((x) => x !== sv.id) : [...b.services, sv.id] })}
                >
                  <Ic size={15} strokeWidth={1.9} />
                  <span>{sv.name}</span>
                  <i className="shift__tick" aria-hidden>
                    <Check size={11} strokeWidth={3} />
                  </i>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {err && <span className="shift__err">{err}</span>}
      {(!blocks.length || blocks[blocks.length - 1].end < closeTime) && (
        <button type="button" className="shift__add" onClick={() => onChange([...blocks, nextBlock(blocks, openTime, closeTime, fallback)])}>
          <Plus size={16} strokeWidth={2.2} /> เพิ่มช่วงเวลา
        </button>
      )}
    </div>
  );
}

/** A therapist sets, per day, the time blocks they work and which services they open in each block. */
export function ShiftEditor({ id, onClose }: { id: string | null; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const [shown, setShown] = useState(id);
  if (id && id !== shown) setShown(id);
  const t = shown ? store.therapistById(shown) : null;

  const [days, setDays] = useState<Block[][]>([]);
  const [day, setDayIdx] = useState(1);
  const [copyTo, setCopyTo] = useState<number[] | null>(null);
  useEffect(() => {
    if (!id) return;
    const ds = toDays(store.therapistById(id));
    setDays(ds);
    setDayIdx(ORDER.find((d) => ds[d].length) ?? 1);
    setCopyTo(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const { openTime, closeTime, closedWeekdays } = store.settings;
  const hours = useMemo(() => {
    const out: string[] = [];
    for (let m = toMinutes(openTime); m <= toMinutes(closeTime); m += 60) out.push(fromMinutes(m));
    return out;
  }, [openTime, closeTime]);

  const setDay = (d: number, blocks: Block[]) => setDays((ds) => ds.map((x, i) => (i === d ? blocks : x)));

  const newBlock = (d: number): Block => nextBlock(days[d], openTime, closeTime, t?.services ?? []);
  const copyDay = (from: number, to: number[]) =>
    setDays((ds) => ds.map((x, i) => (to.includes(i) ? ds[from].map((b) => ({ ...b, services: [...b.services] })) : x)));
  const pct = (h: string) => ((toMinutes(h) - toMinutes(openTime)) / (toMinutes(closeTime) - toMinutes(openTime))) * 100;
  const summary = (blocks: Block[]) => blocks.map((b) => `${b.start.replace(":00", "")}–${b.end.replace(":00", "")}`).join(" · ");

  const valid = days.length === 7 && days.every((b) => !dayError(b));
  const total = days.flat().reduce((h, b) => h + hoursOf(b), 0);
  const workDays = days.filter((b, d) => b.length && !closedWeekdays.includes(d)).length;

  const save = () => {
    if (!t || !valid) return;
    const clean = days.map((b, d) => (closedWeekdays.includes(d) ? [] : b));
    const shifts = toShifts(clean);
    const services = [...new Set(shifts.flatMap((s) => s.services))];
    store.dispatch({ type: "updateTherapist", id: t.id, patch: { shifts, services } });
    toast({ message: `บันทึกตารางงานของ ${t.name} แล้ว` });
    onClose();
  };

  const blocks = days[day] ?? [];
  const closedDay = closedWeekdays.includes(day);

  return (
    <Dialog
      open={id !== null}
      onClose={onClose}
      wide
      className="shift-dialog"
      leading={t ? <Avatar name={t.name} src={therapistPhoto(t)} size="lg" color={t.color} /> : undefined}
      title={t ? `กำหนดตาราง · ${t.name}` : ""}
      subtitle="เลือกวัน แล้วกำหนดช่วงเวลาและบริการที่เปิดให้จอง"
      footer={
        <>
          <span className="shift__total">
            <b>{workDays}</b> วัน · <b>{total}</b> ชม./สัปดาห์
          </span>
          <Button variant="outline" size="lg" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button size="lg" disabled={!valid} leading={<Check size={16} />} onClick={save}>
            บันทึกตาราง
          </Button>
        </>
      }
    >
      {t && days.length === 7 && (
        <div className="shift">
          {/* day picker */}
          <nav className="shift__nav" aria-label="วัน">
            {ORDER.map((d) => {
              const closed = closedWeekdays.includes(d);
              const bad = !!dayError(days[d]);
              return (
                <button
                  key={d}
                  type="button"
                  className={clsx("shift__navday", !days[d].length && "is-off", bad && "is-bad")}
                  aria-pressed={d === day}
                  onClick={() => {
                    setDayIdx(d);
                    setCopyTo(null);
                  }}
                >
                  <b>{TH_WEEKDAYS[d]}</b>
                  <small>{closed ? "คลินิกปิด" : days[d].length ? summary(days[d]) : "หยุด"}</small>
                  {/* mini timeline */}
                  {!closed && (
                    <i className="shift__mini">
                      {days[d].map((b, i) => (
                        <i key={i} style={{ left: `${pct(b.start)}%`, width: `${pct(b.end) - pct(b.start)}%` }} />
                      ))}
                    </i>
                  )}
                </button>
              );
            })}
          </nav>

          {/* selected day */}
          <section className="shift__edit">
            <div className="shift__edit-head">
              <div>
                <h3>วัน{TH_WEEKDAYS[day]}</h3>
                <span className="tw-meta">{closedDay ? "คลินิกปิดทำการ" : blocks.length ? `${blocks.length} ช่วง · ${blocks.reduce((h, b) => h + hoursOf(b), 0)} ชม.` : "ไม่เปิดให้จอง"}</span>
              </div>
              {!closedDay && (
                <label className="shift__onoff">
                  <span>{blocks.length ? "ทำงาน" : "หยุด"}</span>
                  <Switch checked={blocks.length > 0} label={`ทำงานวัน${TH_WEEKDAYS[day]}`} onChange={(v) => setDay(day, v ? [newBlock(day)] : [])} />
                </label>
              )}
            </div>

            {/* timeline of the day */}
            {!closedDay && (
              <div className="shift__line">
                <div className="shift__track">
                  {toMinutes(openTime) < 12 * 60 && toMinutes(closeTime) > 13 * 60 && (
                    <i className="shift__lunch" style={{ left: `${pct("12:00")}%`, width: `${pct("13:00") - pct("12:00")}%` }} />
                  )}
                  {blocks.map((b, i) => (
                    <i key={i} className="shift__seg" style={{ left: `${pct(b.start)}%`, width: `${pct(b.end) - pct(b.start)}%` }}>
                      {b.services.map((x) => store.serviceById(x).short).join(", ")}
                    </i>
                  ))}
                </div>
                <div className="shift__ticks">
                  {hours.map((h) => (
                    <span key={h} style={{ left: `${pct(h)}%` }}>
                      {h.replace(":00", "")}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {closedDay ? (
              <p className="shift__empty">คลินิกปิดทุกวัน{TH_WEEKDAYS[day]} · เปลี่ยนวันเปิดได้ที่หน้าตั้งค่า</p>
            ) : !blocks.length ? (
              <p className="shift__empty">วันนี้ไม่เปิดให้จอง · เปิดสวิตช์ด้านบนเพื่อเพิ่มช่วงเวลา</p>
            ) : (
              <BlockEditor blocks={blocks} onChange={(bs) => setDay(day, bs)} fallback={t.services} />
            )}

            {/* copy this day to others */}
            {!closedDay && blocks.length > 0 && (
              <div className="shift__copy">
                {copyTo === null ? (
                  <button type="button" className="shift__link" onClick={() => setCopyTo([])}>
                    <Copy size={14} /> คัดลอกตารางวันนี้ไปวันอื่น
                  </button>
                ) : (
                  <>
                    <span className="tw-meta">คัดลอกไป</span>
                    {ORDER.filter((d) => d !== day && !closedWeekdays.includes(d)).map((d) => (
                      <button
                        key={d}
                        type="button"
                        className="shift__daychip"
                        aria-pressed={copyTo.includes(d)}
                        onClick={() => setCopyTo(copyTo.includes(d) ? copyTo.filter((x) => x !== d) : [...copyTo, d])}
                      >
                        {TH_WEEKDAYS_SHORT[d]}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="shift__link"
                      onClick={() => setCopyTo(ORDER.filter((d) => d !== day && !closedWeekdays.includes(d)))}
                    >
                      ทุกวัน
                    </button>
                    <span className="shift__copy-acts">
                      <Button variant="outline" size="sm" onClick={() => setCopyTo(null)}>
                        ยกเลิก
                      </Button>
                      <Button
                        size="sm"
                        disabled={!copyTo.length}
                        onClick={() => {
                          copyDay(day, copyTo);
                          toast({ message: `คัดลอกตารางวัน${TH_WEEKDAYS[day]}ไป ${copyTo.length} วันแล้ว` });
                          setCopyTo(null);
                        }}
                      >
                        คัดลอก
                      </Button>
                    </span>
                  </>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </Dialog>
  );
}
