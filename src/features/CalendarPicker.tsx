import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { clsx } from "clsx";
import { IconButton } from "../design-system";
import { TH_WEEKDAYS_SHORT, addDays, fromISODate, startOfWeek, thaiMonthYear, toISODate, todayISO } from "../data/thaiDate";
import "./calendar-picker.css";

interface Props {
  value: string;
  onChange: (iso: string) => void;
  /** reason a day can't be picked, or null */
  blocked?: (iso: string) => string | null;
  /** 0–1 clinic load, drawn as a thin bar under the day */
  load?: (iso: string) => number;
}

/** Inline month calendar for picking a date (Monday-first, Buddhist-era header). */
export function CalendarPicker({ value, onChange, blocked, load }: Props) {
  const [month, setMonth] = useState(() => {
    const d = fromISODate(value);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  useEffect(() => {
    const d = fromISODate(value);
    if (d.getMonth() !== month.getMonth() || d.getFullYear() !== month.getFullYear()) setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const start = startOfWeek(month);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const today = todayISO();
  const thisMonth = new Date(fromISODate(today).getFullYear(), fromISODate(today).getMonth(), 1);

  return (
    <div className="cpick">
      <div className="cpick__head">
        <b>{thaiMonthYear(month)}</b>
        <IconButton
          label="เดือนก่อน"
          variant="soft"
          size="sm"
          disabled={month <= thisMonth}
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
        >
          <ChevronLeft size={16} />
        </IconButton>
        <IconButton label="เดือนถัดไป" variant="soft" size="sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
          <ChevronRight size={16} />
        </IconButton>
      </div>
      <div className="cpick__grid">
        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
          <span key={d} className="cpick__dow">
            {TH_WEEKDAYS_SHORT[d]}
          </span>
        ))}
        {days.map((d) => {
          const iso = toISODate(d);
          const out = d.getMonth() !== month.getMonth();
          const why = blocked?.(iso) ?? null;
          const l = load?.(iso) ?? 0;
          const sel = iso === value;
          return (
            <button
              key={iso}
              type="button"
              className={clsx("cpick__day", out && "cpick__day--out", iso === today && "cpick__day--today")}
              aria-pressed={sel}
              disabled={!!why}
              title={why ?? undefined}
              onClick={() => onChange(iso)}
            >
              {sel && <motion.span layoutId="cpick-sel" className="cpick__sel" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
              <span className="cpick__num">{d.getDate()}</span>
              {!why && l > 0 && (
                <span className="cpick__load">
                  <i style={{ width: `${Math.min(1, l) * 100}%`, background: l > 0.85 ? "var(--red-500)" : l > 0.6 ? "var(--amber-300)" : "var(--green-500)" }} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
