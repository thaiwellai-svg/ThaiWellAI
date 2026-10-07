import { useState } from "react";
import { Trash2, TriangleAlert } from "lucide-react";
import { useStore } from "../store/store";
import { Button, Dialog, Input, useToast } from "../design-system";
import { LIVE } from "../data/mode";
import { cloud } from "../sync/cloud";
import "./reset-patient.css";

const CONFIRM = "ลบทั้งหมด";

/**
 * ล้างข้อมูลที่ใช้ร่วมกับแอปทั้งหมด: นัดทุกแถว · เหตุการณ์ (ยกเว้นเวลาว่างของคลินิก id -1)
 * ผู้ใช้แอปแต่ละคน → ล้างคอร์ส/ประวัติ + resetAt (แอปล้างข้อมูลการรักษาในเครื่องตาม) + ลืม HN · บัญชีแอปยังอยู่
 */
async function wipeCloud() {
  const e1 = (await cloud.from("tw_events").delete().neq("id", -1)).error;
  if (e1) throw e1;
  const e2 = (await cloud.from("tw_appointments").delete().neq("id", "")).error;
  if (e2) throw e2;
  const { data: pts, error } = await cloud.from("tw_patients").select("id,profile");
  if (error) throw error;
  const at = new Date().toISOString();
  for (const p of pts ?? []) {
    const prof = (p.profile ?? {}) as Record<string, unknown>;
    await cloud.from("tw_patients").update({ clinic_hn: null, profile: { ...prof, course: null, visits: [], resetAt: at } }).eq("id", p.id);
  }
  return pts?.length ?? 0;
}

/** ลบข้อมูลทดสอบทั้งหมดของคลินิก (ใช้ก่อนเริ่มใช้งานจริง / เริ่มทดสอบรอบใหม่) */
export function WipeDataDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setText("");
  }
  const b = store.biz;
  const counts = [
    { label: "ผู้รับบริการ", n: store.patients.length },
    { label: "นัดและการรับบริการ", n: store.appointments.length },
    { label: "ใบเสร็จ", n: store.appointments.filter((a) => a.payment).length },
    { label: "คำขอจอง", n: store.requests.length + store.decisions.length },
    { label: "การแจ้งเตือน", n: store.notifications.length },
    { label: "ประวัติการแก้ไข", n: store.audit.length },
    { label: "แพ็กเกจที่ขาย", n: b.sales.length },
    { label: "ปิดยอด/เอกสาร/รอคิว", n: b.closings.length + b.docs.length + b.waitlist.length },
    { label: "ความเคลื่อนไหวคลัง", n: b.moves.length },
  ];

  const wipe = async () => {
    setBusy(true);
    try {
      const users = LIVE ? await wipeCloud() : 0;
      store.dispatch({ type: "wipeTestData" });
      toast({ message: `ล้างข้อมูลทดสอบทั้งหมดแล้ว${users ? ` · แอปผู้ใช้ ${users} บัญชีล้างตาม` : ""}` });
      onClose();
    } catch (e) {
      toast({ message: `ล้างข้อมูลไม่สำเร็จ · ${(e as Error)?.message ?? "ลองใหม่อีกครั้ง"}`, tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      className="rp-dialog"
      leading={
        <span className="st-head__icon rp-ico">
          <Trash2 size={20} strokeWidth={1.9} />
        </span>
      }
      title="รีเซ็ตข้อมูลทั้งระบบ"
      subtitle="ระบบคลินิก + แอป ThaiWell AI ของผู้ใช้ทุกคน · เริ่มทดสอบใหม่ / เริ่มใช้งานจริง"
      footer={
        <>
          <Button variant="outline" size="lg" fill onClick={onClose}>
            ปิด
          </Button>
          <Button variant="danger" size="lg" fill disabled={text.trim() !== CONFIRM || busy} leading={<Trash2 size={16} />} onClick={() => void wipe()}>
            {busy ? "กำลังลบ…" : "ลบข้อมูลทั้งหมด"}
          </Button>
        </>
      }
    >
      <div className="rp">
        <div className="rp__warn">
          <TriangleAlert size={18} />
          <span>
            <b>ลบแล้วกู้คืนไม่ได้</b>
            ถ้าอยากเก็บไว้ ให้กด “สำรองข้อมูล” ด้านบนก่อน
          </span>
        </div>
        <ul className="rp__list">
          {counts.map((c) => (
            <li key={c.label} className={c.n ? undefined : "is-zero"}>
              <span>{c.label}</span>
              <b>{c.n}</b>
            </li>
          ))}
        </ul>
        <p className="rp__keep">
          <b>ยังเก็บไว้:</b> ข้อมูลคลินิก (ชื่อ ที่อยู่ ตำแหน่ง โลโก้) · ผู้บำบัดและตารางงาน · บริการและราคา · แพ็กเกจ · สินค้าในคลัง · การตั้งค่าทั้งหมด · บัญชีเข้าระบบ
        </p>
        <p className="rp__app">นัด ประวัติ คอร์ส บิล และแจ้งเตือนในแอป ThaiWell AI ของผู้ใช้ทุกคนจะถูกล้างตาม · บัญชีแอปของผู้ใช้ยังอยู่ (จองใหม่แล้วได้ HN ใหม่)</p>
        <label className="rp__type">
          <span>
            พิมพ์ <b>{CONFIRM}</b> เพื่อยืนยัน
          </span>
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={CONFIRM} aria-label="พิมพ์คำยืนยัน" />
        </label>
      </div>
    </Dialog>
  );
}
