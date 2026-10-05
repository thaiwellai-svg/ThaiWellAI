import { useRef, useState } from "react";
import { Camera, Loader2, ShieldCheck, X } from "lucide-react";
import { useToast } from "../design-system";
import { fileToPortrait } from "./photo";
import "./photo-slot.css";

/** registration photo: big tile + "ถ่ายรูป" / "เลือกจากคลังภาพ" + consent note */
export function PhotoSlot({ value, onChange }: { value?: string; onChange: (dataUrl: string) => void }) {
  const cam = useRef<HTMLInputElement>(null);
  const lib = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const pick = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await fileToPortrait(file));
    } catch {
      toast({ message: "ใช้รูปนี้ไม่ได้ ลองเลือกรูปอื่น", tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="pslot">
      <button type="button" className={value ? "pslot__tile has-photo" : "pslot__tile"} onClick={() => lib.current?.click()} aria-label="เปลี่ยนรูปผู้รับบริการ" title="แตะเพื่อถ่ายหรือเลือกรูป">
        {value ? (
          <img src={value} alt="" />
        ) : (
          <svg viewBox="0 0 96 96" className="pslot__ph" aria-hidden>
            <circle cx="48" cy="38" r="17" />
            <path d="M14 96c2-20 16-32 34-32s32 12 34 32Z" />
          </svg>
        )}
        {busy && (
          <span className="pslot__busy">
            <Loader2 size={22} className="spin" />
          </span>
        )}
        <span className="pslot__badge">
          <Camera size={14} strokeWidth={2.2} />
        </span>
      </button>
      {value && (
        <button type="button" className="pslot__del" aria-label="ลบรูป" onClick={() => onChange("")}>
          <X size={12} strokeWidth={2.8} />
        </button>
      )}
      <small className="pslot__note">
        <ShieldCheck size={12} /> แตะรูปเพื่อถ่ายหรือเลือกรูป · เมื่อผู้ป่วยยินยอมเท่านั้น
      </small>
      <input ref={cam} type="file" accept="image/*" capture="user" hidden onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ""))} />
      <input ref={lib} type="file" accept="image/*" hidden onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ""))} />
    </div>
  );
}
