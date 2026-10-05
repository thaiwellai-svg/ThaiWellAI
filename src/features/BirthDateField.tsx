import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { TH_MONTH } from "../data/elements";


/** birth-date picker: year → month → day, big touch targets, Thai months & พ.ศ. — value is ISO YYYY-MM-DD or "" */
export function BirthDateField({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const full = isFullDate(value);
  const now = new Date();
  const [open, setOpen] = useState(false);
  const [y, setY] = useState(now.getFullYear() - 30);
  const [m, setM] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    if (full) {
      const d = new Date(value);
      setY(d.getFullYear());
      setM(d.getMonth());
    }
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
          {(
            <div className="bdc__view">
              <div className="bdc__nav">
                <button type="button" onClick={() => stepMonth(-1)} aria-label="เดือนก่อน">
                  <ChevronLeft size={18} />
                </button>
                <div className="bdc__pick">
                  <select value={m} onChange={(e) => setM(Number(e.target.value))} aria-label="เดือน">
                    {TH_MONTH.map((n, i) => (
                      <option key={n} value={i} disabled={future(y, i)}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <select
                    value={y + 543}
                    onChange={(e) => {
                      const ny = Number(e.target.value) - 543;
                      setY(ny);
                      if (future(ny, m)) setM(now.getMonth());
                    }}
                    aria-label="ปี พ.ศ."
                  >
                    {Array.from({ length: 111 }, (_, i) => nowBE - i).map((be) => (
                      <option key={be} value={be}>
                        {be}
                      </option>
                    ))}
                  </select>
                </div>
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
