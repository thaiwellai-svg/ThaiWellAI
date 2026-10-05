import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Avatar, useToast } from "../design-system";
import { CameraIcon } from "../design-system/icons";
import { fileToPortrait } from "./photo";
import "./photo-picker.css";

interface PhotoPickerProps {
  name: string;
  src?: string;
  size?: "card" | "xl" | "2xl";
  onPick: (dataUrl: string) => void;
}

/**
 * Tap to take/choose a portrait. On iPad the file input offers "Take Photo" or the library.
 * Images are center-cropped to 320px JPEG before they are stored.
 */
export function PhotoPicker({ name, src, size = "card", onPick }: PhotoPickerProps) {
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  return (
    <motion.button
      type="button"
      className="photo-pick"
      aria-label="ถ่ายหรือเลือกรูปโปรไฟล์"
      title="ถ่ายหรือเลือกรูปโปรไฟล์ (เมื่อผู้ป่วยยินยอม)"
      whileTap={{ scale: 0.94 }}
      onClick={() => input.current?.click()}
    >
      <Avatar name={name} src={src} size={size} shape="squircle" />
      <span className="photo-pick__badge" data-busy={busy || undefined}>
        <CameraIcon width={13} height={13} />
      </span>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true);
          try {
            onPick(await fileToPortrait(file));
            toast({ message: "อัปเดตรูปโปรไฟล์แล้ว" });
          } catch {
            toast({ message: "ใช้รูปนี้ไม่ได้ ลองเลือกรูปอื่น", tone: "danger" });
          } finally {
            setBusy(false);
          }
        }}
      />
    </motion.button>
  );
}
