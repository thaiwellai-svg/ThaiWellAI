import { useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, ShieldCheck, X } from "lucide-react";
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
      <button type="button" className={value ? "pslot__tile has-photo" : "pslot__tile"} onClick={() => cam.current?.click()} aria-label="ถ่ายรูปผู้รับบริการ">
        {busy ? <Loader2 size={24} className="spin" /> : value ? <img src={value} alt="" /> : (
          <>
            <Camera size={26} strokeWidth={1.8} />
            <small>เพิ่มรูป</small>
          </>
        )}
      </button>
      {value && (
        <button type="button" className="pslot__del" aria-label="ลบรูป" onClick={() => onChange("")}>
          <X size={13} strokeWidth={2.6} />
        </button>
      )}
      <div className="pslot__side">
        <b>รูปผู้รับบริการ</b>
        <div className="pslot__btns">
          <button type="button" onClick={() => cam.current?.click()}>
            <Camera size={15} /> ถ่ายรูป
          </button>
          <button type="button" onClick={() => lib.current?.click()}>
            <ImagePlus size={15} /> เลือกจากคลังภาพ
          </button>
        </div>
        <small>
          <ShieldCheck size={12} /> ถ่ายเมื่อผู้ป่วยยินยอม · ใช้ยืนยันตัวตนในคลินิกเท่านั้น
        </small>
      </div>
      <input ref={cam} type="file" accept="image/*" capture="user" hidden onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ""))} />
      <input ref={lib} type="file" accept="image/*" hidden onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ""))} />
    </div>
  );
}
