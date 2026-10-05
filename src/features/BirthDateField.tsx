import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { TH_MONTH } from "../data/elements";

/** birth-date picker: a field that opens a calendar (Thai months, พ.ศ. years) — value is ISO YYYY-MM-DD or "" */
export function BirthDateField({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const full = isFullDate(value);
  const [open, setOpen] = useState(false);
  const now = new Date();
  const init = full ? new Date(value) : new Date(now.getFullYear() - 30, 0, 1);
  const [view, setView] = useState({ y: init.getFullYear(), m: init.getMonth() });
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    if (full) {
      const d = new Date(value);
      setView({ y: d.getFullYear(), m: d.getMonth() });
    }
    const off = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("pointerdown", off);
    return () => window.removeEventListener("pointerdown", off);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const first = new Date(view.y, view.m, 1).getDay();
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const sel = full ? value.split("-").map(Number) : null;
  const iso = (d: number) => `${view.y}-${String(view.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const future = (d: number) => new Date(view.y, view.m, d) > now;
  const shift = (n: number) => setView((v) => {
    const t = new Date(v.y, v.m + n, 1);
    return { y: t.getFullYear(), m: t.getMonth() };
  });
  const nowBE = now.getFullYear() + 543;

  return (
    <div className="bdc" ref={box}>
      <button type="button" className={full ? "bdc__field" : "bdc__field is-empty"} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <CalendarDays size={16} />
        <span>{full ? thaiBirth(value) : "เลือกวันเกิด"}</span>
        {full && <em>อายุ {ageFrom(value)} ปี</em>}
      </button>
      {open && (
        <div className="bdc__pop" role="dialog" aria-label="เลือกวันเกิด">
          <div className="bdc__nav">
            <button type="button" onClick={() => shift(-1)} aria-label="เดือนก่อน">
              <ChevronLeft size={16} />
            </button>
            <select value={view.m} onChange={(e) => setView({ ...view, m: Number(e.target.value) })} aria-label="เดือน">
              {TH_MONTH.map((n, i) => (
                <option key={n} value={i}>
                  {n}
                </option>
              ))}
            </select>
            <select value={view.y + 543} onChange={(e) => setView({ ...view, y: Number(e.target.value) - 543 })} aria-label="ปี พ.ศ.">
              {Array.from({ length: 111 }, (_, i) => nowBE - i).map((be) => (
                <option key={be} value={be}>
                  {be}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => shift(1)} aria-label="เดือนถัดไป" disabled={view.y === now.getFullYear() && view.m >= now.getMonth()}>
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="bdc__grid">
            {["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"].map((d) => (
              <small key={d}>{d}</small>
            ))}
            {cells.map((d, i) =>
              d ? (
                <button
                  key={i}
                  type="button"
                  disabled={future(d)}
                  className={sel && sel[0] === view.y && sel[1] === view.m + 1 && sel[2] === d ? "is-on" : undefined}
                  onClick={() => {
                    onChange(iso(d));
                    setOpen(false);
                  }}
                >
                  {d}
                </button>
              ) : (
                <span key={i} />
              ),
            )}
          </div>
          <p className="bdc__hint">เลือกเดือนและปี พ.ศ. ด้านบน แล้วแตะวันที่</p>
        </div>
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
