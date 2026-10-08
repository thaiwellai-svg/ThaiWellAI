import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { QrCode } from "lucide-react";
import { Button, Dialog } from "../design-system";
import { useStore } from "../store/store";
import { thaiDateLong, todayISO } from "../data/thaiDate";
import { CHECKIN_WINDOW_MS, checkinCode, checkinQrText, checkinWindow, newCheckinSecret } from "./checkinCode";
import "./checkin-qr.css";

/**
 * QR เช็กอิน (แยกจาก QR ชำระเงิน) — วางจอนี้ไว้ที่เคาน์เตอร์ ผู้ป่วยสแกนด้วยแอป ThaiWell AI เพื่อรับเลขคิวตามลำดับที่มาถึง
 * QR เปลี่ยนใหม่ทุก 30 วินาที (มีนับถอยหลัง) · ใต้ QR มีรหัส 6 ตัวให้พิมพ์เองได้ถ้ากล้องสแกนไม่ได้
 */
export function CheckinQr({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useStore();
  const { settings } = store;
  const [now, setNow] = useState(Date.now());
  const [img, setImg] = useState<string | null>(null);

  // ยังไม่มีรหัสลับ (ครั้งแรก) → สร้างแล้วเก็บกับการตั้งค่าคลินิก (ทุกเครื่องได้รหัสเดียวกัน)
  useEffect(() => {
    if (open && !settings.checkinSecret) store.dispatch({ type: "updateSettings", patch: { checkinSecret: newCheckinSecret() } });
  }, [open, settings.checkinSecret]); // eslint-disable-line react-hooks/exhaustive-deps
  // นับถอยหลังทุกวินาที · ครบ 30 วินาที → รหัสใหม่
  useEffect(() => {
    if (!open) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [open]);
  const w = checkinWindow(now);
  const left = Math.ceil(((w + 1) * CHECKIN_WINDOW_MS - now) / 1000);
  const code = settings.checkinSecret ? checkinCode(settings.checkinSecret, w) : "";
  useEffect(() => {
    if (!code) return;
    void QRCode.toDataURL(checkinQrText(code), { margin: 1, width: 640, errorCorrectionLevel: "M", color: { dark: "#1f2a22", light: "#ffffff" } }).then(setImg);
  }, [code]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      className="cq-dialog"
      leading={
        <span className="st-head__icon">
          <QrCode size={20} strokeWidth={1.9} />
        </span>
      }
      title="QR เช็กอิน"
      subtitle="ตั้งจอนี้ที่เคาน์เตอร์ ให้ผู้ป่วยสแกนด้วยแอป ThaiWell"
      footer={
        <Button size="lg" onClick={onClose}>
          ปิด
        </Button>
      }
    >
      <div className="cq">
        <b className="cq__clinic">{settings.clinicName}</b>
        <div className="cq__qr">{img ? <img src={img} alt={`QR เช็กอิน รหัส ${code}`} /> : <span>กำลังสร้าง QR…</span>}</div>
        <div className="cq__code" aria-label="รหัสเช็กอิน">
          {code.split("").map((c, i) => (
            <span key={i}>{c}</span>
          ))}
        </div>
        <p className="cq__hint">
          ในแอป: นัดวันนี้ → เช็กอิน → สแกน QR
          <br />
          สแกนไม่ได้ ให้พิมพ์รหัสด้านบน
        </p>
        <div className="cq__timer" style={{ ["--p" as string]: `${(left / 30) * 100}%` }}>
          <i />
          <small>QR ใหม่ใน {left} วินาที · {thaiDateLong(todayISO())}</small>
        </div>
      </div>
    </Dialog>
  );
}
