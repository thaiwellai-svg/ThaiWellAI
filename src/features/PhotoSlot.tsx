import { useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { useToast } from "../design-system";
import { fileToPortrait } from "./photo";
import "./photo-slot.css";

/** registration photo: big tile + "ถ่ายรูป" / "เลือกจากคลังภาพ" + consent note */
export function PhotoSlot({ value, onChange, name = "" }: { value?: string; onChange: (dataUrl: string) => void; /** first name — its first letter stands in until there is a photo */ name?: string }) {
  // first Thai consonant/letter (skip leading vowels like เ แ โ ใ ไ)
  const initial = name.trim().replace(/^[เแโใไ]/, "").charAt(0);
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
      <button type="button" className={value ? "pslot__tile has-photo" : "pslot__tile"} onClick={() => lib.current?.click()} aria-label="เปลี่ยนรูปผู้ป่วย" title="แตะเพื่อถ่ายหรือเลือกรูป">
        {value ? (
          <img src={value} alt="" />
        ) : (
          <span className="pslot__ini">{initial || "?"}</span>
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
      <span className="pslot__label">{value ? "เปลี่ยนรูป" : "เพิ่มรูป"}</span>
      <input ref={cam} type="file" accept="image/*" capture="user" hidden onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ""))} />
      <input ref={lib} type="file" accept="image/*" hidden onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ""))} />
    </div>
  );
}
