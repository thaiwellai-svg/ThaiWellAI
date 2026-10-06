import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { WorkPage } from "../../layout/WorkPage";
import { BackLead } from "../../layout/BackLead";
import "../appointments/appointment-detail.css";
import "./biz.css";

/** shared sub-page frame: back button header + one white sheet with a top bar */
export function BizPage({ eyebrow, title, back = "/billing", bar, children }: { eyebrow: string; title: string; back?: string; bar?: ReactNode; children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <WorkPage eyebrow={eyebrow} title={title} bell={false} lead={<BackLead eyebrow={eyebrow} title={title} onBack={() => (window.history.length > 1 ? navigate(-1) : navigate(back))} />}>
      <div className="adp">
        {bar && <div className="adp__bar">{bar}</div>}
        <div className="adp__body scroll-y scroll-y--light">{children}</div>
      </div>
    </WorkPage>
  );
}

export function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number }[] }) {
  return (
    <div className="bz-tabs" role="tablist">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
          {o.count != null && <em>{o.count}</em>}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: string }) {
  return (
    <div className="bz-stat" style={tone ? { ["--tc" as string]: tone } : undefined}>
      <small>{label}</small>
      <b>{value}</b>
      {sub && <em>{sub}</em>}
    </div>
  );
}
