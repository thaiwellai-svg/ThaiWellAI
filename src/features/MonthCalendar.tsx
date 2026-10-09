import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { clsx } from "clsx";
import { TH_WEEKDAYS_SHORT, addDays, fromISODate, startOfWeek, thaiMonthYear, toISODate, todayISO } from "../data/thaiDate";
import "./month-calendar.css";

/** ปฏิทินเดือน (เริ่มวันจันทร์) · เลือกวันได้ตั้งแต่ min · ปิดวันหยุดคลินิก · จุด = วันที่ผู้ป่วยมีนัดแล้ว · “ขอ” = วันที่ผู้ป่วยขอ */
export function MonthCalendar({
  value,
  onChange,
  min = todayISO(),
  closedWeekdays = [],
  marked = [],
  requested,
}: {
  value: string;
  onChange: (iso: string) => void;
  min?: string;
  closedWeekdays?: number[];
  /** วันที่ผู้ป่วยมีนัดอยู่แล้ว */
  marked?: string[];
  /** วันที่ผู้ป่วยขอมา */
  requested?: string;
}) {
  const [month, setMonth] = useState(() => fromISODate(value || min));
  useEffect(() => {
    if (value) setMonth(fromISODate(value));
  }, [value]);
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = startOfWeek(first);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  // ตัดแถวสุดท้ายถ้าเป็นเดือนถัดไปทั้งแถว
  const rows = days[35].getMonth() !== month.getMonth() ? 5 : 6;
  const today = todayISO();
  const canPrev = toISODate(new Date(month.getFullYear(), month.getMonth(), 0)) >= min;
  const go = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const weekdays = [1, 2, 3, 4, 5, 6, 0];
  return (
    <div className="mcal">
      <div className="mcal__head">
        <button type="button" onClick={() => go(-1)} disabled={!canPrev} aria-label="เดือนก่อน">
          <ChevronLeft size={16} />
        </button>
        <b>{thaiMonthYear(month)}</b>
        <button type="button" onClick={() => go(1)} aria-label="เดือนถัดไป">
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="mcal__grid" role="grid">
        {weekdays.map((w) => (
          <small key={w} className={clsx("mcal__wd", closedWeekdays.includes(w) && "is-closed")}>
            {TH_WEEKDAYS_SHORT[w]}
          </small>
        ))}
        {days.slice(0, rows * 7).map((d) => {
          const iso = toISODate(d);
          const out = d.getMonth() !== month.getMonth();
          const closed = closedWeekdays.includes(d.getDay());
          const off = iso < min || closed;
          return (
            <button
              key={iso}
              type="button"
              className={clsx("mcal__d", out && "is-out", iso === today && "is-today", iso === value && "is-on", closed && "is-closed")}
              disabled={off}
              aria-pressed={iso === value}
              aria-label={iso}
              onClick={() => onChange(iso)}
            >
              {d.getDate()}
              {iso === requested && <em>ขอ</em>}
              {marked.includes(iso) && <i />}
            </button>
          );
        })}
      </div>
      {(requested || marked.length > 0) && (
        <div className="mcal__legend">
          {requested && (
            <span>
              <em>ขอ</em> วันที่ผู้ป่วยขอ
            </span>
          )}
          {marked.length > 0 && (
            <span>
              <i /> มีนัดแล้ว
            </span>
          )}
        </div>
      )}
    </div>
  );
}
