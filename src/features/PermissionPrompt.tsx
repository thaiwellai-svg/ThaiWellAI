import { useEffect, useState } from "react";
import { BellRing, X } from "lucide-react";
import { requestWebNotify, webNotifyStatus } from "../sync/notify";
import "./permission-prompt.css";

const KEY = "thaiwell.notify.asked";

/**
 * ใช้ผ่านเบราว์เซอร์: ขออนุญาตแจ้งเตือนอย่างชัดเจน (ปุ่มอนุญาต) · ถูกบล็อก → บอกวิธีเปิดในเบราว์เซอร์
 * แสดงครั้งเดียวต่อเครื่อง (ปิดได้) · แอป iPad ไม่แสดง (ขอสิทธิ์เองตอนเปิด)
 */
export function PermissionPrompt() {
  const [st, setSt] = useState(webNotifyStatus());
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(KEY) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    const t = window.setInterval(() => setSt(webNotifyStatus()), 3000);
    return () => window.clearInterval(t);
  }, []);
  // iPad/iPhone ผ่าน Safari: แจ้งเตือนได้เมื่อเพิ่มไปยังหน้าจอโฮมแล้ว
  const iosTab = /iPad|iPhone|Macintosh/.test(navigator.userAgent) && "ontouchend" in document && !(navigator as { standalone?: boolean }).standalone && !window.matchMedia("(display-mode: standalone)").matches;
  if (hidden || st === "granted" || st === "native" || (st === "unsupported" && !iosTab)) return null;
  const close = () => {
    setHidden(true);
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* private mode */
    }
  };
  return (
    <div className="perm" role="dialog" aria-label="อนุญาตการแจ้งเตือน">
      <span className="perm__ic">
        <BellRing size={18} />
      </span>
      <div className="perm__body">
        <b>{st === "unsupported" ? "รับแจ้งเตือนบน iPad" : st === "denied" ? "การแจ้งเตือนถูกปิดในเบราว์เซอร์" : "เปิดการแจ้งเตือน"}</b>
        <small>
          {st === "unsupported"
            ? "กดปุ่มแชร์ ⎙ → “เพิ่มไปยังหน้าจอโฮม” แล้วเปิดจากไอคอนบนหน้าจอโฮม จึงรับแจ้งเตือนได้"
            : st === "denied"
            ? "กดไอคอนแม่กุญแจหน้าที่อยู่เว็บ → การแจ้งเตือน → อนุญาต แล้วโหลดหน้าใหม่"
            : "รู้ทันทีเมื่อมีคำขอจองใหม่ แม้ปิดหน้าเว็บอยู่"}
        </small>
      </div>
      {st === "default" && (
        <button type="button" className="perm__ok" onClick={() => void requestWebNotify().then(() => setSt(webNotifyStatus()))}>
          อนุญาต
        </button>
      )}
      <button type="button" className="perm__x" onClick={close} aria-label="ปิด">
        <X size={16} />
      </button>
    </div>
  );
}
