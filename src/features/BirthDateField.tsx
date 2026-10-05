import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { TH_MONTH } from "../data/elements";

const TH_MON_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** birth-date picker: year → month → day, big touch targets, Thai months & พ.ศ. — value is ISO YYYY-MM-DD or "" */
export function BirthDateField({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const full = isFullDate(value);
  const now = new Date();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"year" | "month" | "day">("year");
  const [y, setY] = useState(now.getFullYear() - 30);
  const [m, setM] = useState(0);
  const [decade, setDecade] = useState(Math.floor((now.getFullYear() - 30 + 543) / 10) * 10);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    if (full) {
      const d = new Date(value);
      setY(d.getFullYear());
      setM(d.getMonth());
      setDecade(Math.floor((d.getFullYear() + 543) / 10) * 10);
      setMode("day");
    } else setMode("year");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const nowBE = now.getFullYear() + 543;
  const minBE = nowBE - 110;
  const sel = full ? value.split("-").map(Number) : null;
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const future = (yy: number, mm: number, dd = 1) => new Date(yy, mm, dd) > now;
  const stepMonth = (n: number) => {
    const t = new Date(y, m + n, 1);
    if (t > now || t.getFullYear() + 543 < minBE) return;
    setY(t.getFullYear());
    setM(t.getMonth());
  };

  return (
    <div className="bdc" ref={box} onClick={(e) => (e.target as HTMLElement).closest(".bdc__pop") && e.preventDefault()}>
      <button type="button" className={full ? "bdc__field" : "bdc__field is-empty"} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <CalendarDays size={16} />
        <span>{full ? thaiBirth(value) : "เลือกวันเกิด"}</span>
        {full && <em>อายุ {ageFrom(value)} ปี</em>}
      </button>
      {open &&
        createPortal(
        <div className="bdc__scrim" onPointerDown={(e) => e.target === e.currentTarget && setOpen(false)}>
        <div className="bdc__pop" role="dialog" aria-label="เลือกวันเกิด">
          <div className="bdc__title">
            <b>เลือกวันเกิด</b>
            <button type="button" onClick={() => setOpen(false)} aria-label="ปิด">
              <X size={16} />
            </button>
          </div>
          {/* breadcrumb: tap to jump back a level */}
          <div className="bdc__crumbs">
            <button type="button" aria-pressed={mode === "year"} onClick={() => setMode("year")}>
              <small>ปี พ.ศ.</small>
              <b>{mode === "year" && !full ? "เลือกปี" : y + 543}</b>
            </button>
            <i>›</i>
            <button type="button" aria-pressed={mode === "month"} disabled={mode === "year" && !full} onClick={() => setMode("month")}>
              <small>เดือน</small>
              <b>{mode === "year" && !full ? "—" : TH_MONTH[m]}</b>
            </button>
            <i>›</i>
            <button type="button" aria-pressed={mode === "day"} disabled={mode !== "day" && !full}>
              <small>วันที่</small>
              <b>{sel && sel[0] === y && sel[1] === m + 1 ? sel[2] : "—"}</b>
            </button>
          </div>

          {mode === "year" && (
            <div className="bdc__view">
              <div className="bdc__nav">
                <button type="button" onClick={() => setDecade((d) => Math.max(Math.floor(minBE / 10) * 10, d - 10))} aria-label="ทศวรรษก่อน">
                  <ChevronLeft size={18} />
                </button>
                <b>
                  {decade} – {decade + 9}
                </b>
                <button type="button" onClick={() => setDecade((d) => Math.min(Math.floor(nowBE / 10) * 10, d + 10))} aria-label="ทศวรรษถัดไป">
                  <ChevronRight size={18} />
                </button>
              </div>
              <div className="bdc__cells bdc__cells--year">
                {Array.from({ length: 10 }, (_, i) => decade + i).map((be) => (
                  <button
                    key={be}
                    type="button"
                    disabled={be > nowBE || be < minBE}
                    className={y + 543 === be && (full || mode !== "year") ? "is-on" : undefined}
                    onClick={() => {
                      setY(be - 543);
                      if (future(be - 543, m)) setM(now.getMonth());
                      setMode("month");
                    }}
                  >
                    {be}
                    <small>อายุ {nowBE - be} ปี</small>
                  </button>
                ))}
              </div>
            </div>
          )}

          {mode === "month" && (
            <div className="bdc__view">
              <div className="bdc__cells bdc__cells--month">
                {TH_MON_SHORT.map((n, i) => (
                  <button
                    key={n}
                    type="button"
                    disabled={future(y, i)}
                    className={i === m && (full || mode !== "month") ? "is-on" : undefined}
                    onClick={() => {
                      setM(i);
                      setMode("day");
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}

          {mode === "day" && (
            <div className="bdc__view">
              <div className="bdc__nav">
                <button type="button" onClick={() => stepMonth(-1)} aria-label="เดือนก่อน">
                  <ChevronLeft size={18} />
                </button>
                <b>
                  {TH_MONTH[m]} {y + 543}
                </b>
                <button type="button" onClick={() => stepMonth(1)} aria-label="เดือนถัดไป" disabled={future(y, m + 1)}>
                  <ChevronRight size={18} />
                </button>
              </div>
              <div className="bdc__cells bdc__cells--day">
                {["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"].map((d) => (
                  <small key={d}>{d}</small>
                ))}
                {Array.from({ length: first }, (_, i) => (
                  <span key={`e${i}`} />
                ))}
                {Array.from({ length: days }, (_, i) => i + 1).map((d) => (
                  <button
                    key={d}
                    type="button"
                    disabled={future(y, m, d)}
                    className={sel && sel[0] === y && sel[1] === m + 1 && sel[2] === d ? "is-on" : undefined}
                    onClick={() => {
                      onChange(`${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
                      setOpen(false);
                    }}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

/** complete ISO date? */
export const isFullDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !v.includes("-00") && !v.startsWith("0000");

/** whole years from an ISO birth date */
export function ageFrom(dob?: string): number | null {
  if (!dob || !isFullDate(dob)) return null;
  const b = new Date(dob);
  const n = new Date();
  return n.getFullYear() - b.getFullYear() - (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate()) ? 1 : 0);
}

/** "12 เมษายน 2528" */
export const thaiBirth = (dob: string) => {
  const [y, m, d] = dob.split("-").map(Number);
  return `${d} ${TH_MONTH[m - 1]} ${y + 543}`;
};
