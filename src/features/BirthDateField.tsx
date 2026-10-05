import { TH_MONTH } from "../data/elements";

/** วัน / เดือน / ปี พ.ศ. — value is an ISO date (YYYY-MM-DD) or "" */
export function BirthDateField({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const [y, m, d] = value ? value.split("-").map(Number) : [0, 0, 0];
  const nowBE = new Date().getFullYear() + 543;
  const days = y && m ? new Date(y, m, 0).getDate() : 31;
  const set = (ny: number, nm: number, nd: number) => {
    if (!ny || !nm || !nd) {
      // keep partial picks in the selects until all three are chosen
      onChange(ny || nm || nd ? `${String(ny || 0).padStart(4, "0")}-${String(nm || 0).padStart(2, "0")}-${String(nd || 0).padStart(2, "0")}` : "");
      return;
    }
    const max = new Date(ny, nm, 0).getDate();
    onChange(`${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(nd, max)).padStart(2, "0")}`);
  };
  return (
    <div className="bdf">
      <select className="tw-input" value={d || ""} onChange={(e) => set(y, m, Number(e.target.value))} aria-label="วันที่">
        <option value="">วัน</option>
        {Array.from({ length: days }, (_, i) => (
          <option key={i} value={i + 1}>
            {i + 1}
          </option>
        ))}
      </select>
      <select className="tw-input" value={m || ""} onChange={(e) => set(y, Number(e.target.value), d)} aria-label="เดือน">
        <option value="">เดือน</option>
        {TH_MONTH.map((name, i) => (
          <option key={name} value={i + 1}>
            {name}
          </option>
        ))}
      </select>
      <select className="tw-input" value={y ? y + 543 : ""} onChange={(e) => set(Number(e.target.value) - 543, m, d)} aria-label="ปี พ.ศ.">
        <option value="">ปี พ.ศ.</option>
        {Array.from({ length: 101 }, (_, i) => nowBE - i).map((be) => (
          <option key={be} value={be}>
            {be}
          </option>
        ))}
      </select>
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
