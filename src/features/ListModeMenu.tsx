import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

/** the only option of a list pane: one icon that flips between full rows and photo + name */
export function ListModeMenu({ slim, setSlim }: { slim: boolean; setSlim: (v: boolean) => void }) {
  const label = slim ? "ขยายรายการ" : "ย่อรายการ";
  return (
    <button type="button" className="ws__icon" onClick={() => setSlim(!slim)} aria-label={label} title={label}>
      {slim ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
    </button>
  );
}
