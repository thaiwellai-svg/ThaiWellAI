import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./patient-print.css";

/** Generic A4 print: returns [print(sheet), portal]. The sheet renders in .pp-root (only it is shown in print). */
export function usePrintSheet() {
  const [sheet, setSheet] = useState<ReactNode>(null);
  useEffect(() => {
    if (!sheet) return;
    const done = () => setSheet(null);
    window.addEventListener("afterprint", done);
    const t = window.setTimeout(() => window.print(), 60);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("afterprint", done);
    };
  }, [sheet]);
  const node = sheet ? createPortal(<div className="pp-root">{sheet}</div>, document.body) : null;
  return [(s: ReactNode) => setSheet(s), node] as const;
}

/** Shared letterhead for printed documents */
export function PrintHead({ clinic, title, no, date }: { clinic: string; title: string; no?: string; date: string }) {
  return (
    <header className="pps__head">
      <div>
        <h1>{title}</h1>
        <p>{clinic}</p>
      </div>
      <div className="pps__date">
        {no && (
          <>
            เลขที่ {no}
            <br />
          </>
        )}
        {date}
      </div>
    </header>
  );
}
