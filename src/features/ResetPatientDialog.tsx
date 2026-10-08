import { useState } from "react";
import { RotateCcw, TriangleAlert, UserX } from "lucide-react";
import { useStore } from "../store/store";
import { Button, Dialog, useToast } from "../design-system";
import { LIVE } from "../data/mode";
import { cloud } from "../sync/cloud";
import "./reset-patient.css";

/** ลบนัด/ประวัติของบัญชีแอปใน cloud + ส่งสัญญาณให้แอปของผู้ป่วยล้างข้อมูลการรักษาตาม (บัญชีแอปของผู้ใช้ยังอยู่) */
export async function resetCloud(cloudId: string, forgetHn = false) {
  const { data: rows, error } = await cloud.from("tw_appointments").select("id").eq("patient_id", cloudId);
  if (error) throw error;
  const ids = (rows ?? []).map((r) => r.id as string);
  if (ids.length) {
    await cloud.from("tw_events").delete().in("appointment_id", ids);
    const { error: e2 } = await cloud.from("tw_appointments").delete().eq("patient_id", cloudId);
    if (e2) throw e2;
  }
  const { data } = await cloud.from("tw_patients").select("profile").eq("id", cloudId).maybeSingle();
  const prof = (data?.profile ?? {}) as Record<string, unknown>;
  // resetAt → แอปของผู้ป่วยเห็นแล้วล้างนัด เรื่องที่รักษา บิล และแจ้งเตือนในเครื่อง
  await cloud.from("tw_patients").update({ profile: { ...prof, course: null, visits: [], resetAt: new Date().toISOString() }, ...(forgetHn ? { clinic_hn: null } : {}) }).eq("id", cloudId);
  return ids.length;
}

/**
 * รีเซ็ตข้อมูลการรักษาของผู้ป่วย (ใช้ทดสอบ) — ลบนัด คำขอจอง ใบเสร็จ คอร์ส แผนการรักษา ผลคัดกรอง เอกสาร
 * ข้อมูลส่วนตัว (ชื่อ HN เลขบัตร ที่อยู่ เบอร์ รูป) ยังอยู่ · ย้อนกลับไม่ได้
 */
export function ResetPatientDialog({ patientId, onClose, mode = "reset", onDone }: { patientId: string | null; onClose: () => void; mode?: "reset" | "remove"; onDone?: () => void }) {
  const remove = mode === "remove";
  const store = useStore();
  const toast = useToast();
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState<string | null>(patientId);
  if (patientId && patientId !== shown) {
    setShown(patientId);
    setOk(false);
  }
  const id = patientId ?? shown;
  if (!id) return null;
  const p = store.patientById(id);
  const appts = store.appointments.filter((a) => a.patientId === id);
  const counts = [
    { label: "นัดและการรักษา", n: appts.length },
    { label: "ใบเสร็จ", n: appts.filter((a) => a.payment).length + appts.reduce((n, a) => n + (a.voidedPayments?.length ?? 0), 0) },
    { label: "คำขอจอง", n: store.requests.filter((r) => r.patientId === id).length + store.decisions.filter((d) => d.request.patientId === id).length },
    { label: "คอร์ส", n: p.course ? 1 : 0 },
    { label: "แผนการรักษา AI", n: p.aiPlan ? 1 : 0 },
    { label: "แพ็กเกจที่ซื้อ", n: store.biz.sales.filter((x) => x.patientId === id).length },
    { label: "ประวัติความปวด", n: p.painHistory.length },
  ];
  const app = !!p.cloudId && LIVE;

  const reset = async () => {
    setBusy(true);
    try {
      // cloud ก่อน (แอปผู้ป่วย) แล้วค่อยล้างในคลินิก
      if (app) await resetCloud(p.cloudId!, remove);
      store.dispatch(remove ? { type: "removePatient", id } : { type: "resetPatientData", id });
      toast({ message: `${remove ? "ลบ" : "รีเซ็ตข้อมูลการรักษาของ"} ${p.name} แล้ว${app ? " · แอปล้างตามแล้ว" : ""}` });
      onClose();
      onDone?.();
    } catch (e) {
      toast({ message: `ไม่สำเร็จ · ${(e as Error)?.message ?? "ลองใหม่"}`, tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={!!patientId}
      onClose={onClose}
      className="rp-dialog"
      leading={
        <span className="st-head__icon rp-ico">
          {remove ? <UserX size={20} strokeWidth={1.9} /> : <RotateCcw size={20} strokeWidth={1.9} />}
        </span>
      }
      title={remove ? "ลบผู้ป่วย" : "รีเซ็ตข้อมูลการรักษา"}
      subtitle={`${p.name} · ใช้ทดสอบระบบ`}
      footer={
        <>
          <Button variant="outline" size="lg" fill onClick={onClose}>
            ปิด
          </Button>
          <Button variant="danger" size="lg" fill disabled={!ok || busy} leading={remove ? <UserX size={16} /> : <RotateCcw size={16} />} onClick={() => void reset()}>
            {busy ? (remove ? "กำลังลบ…" : "กำลังรีเซ็ต…") : remove ? "ลบผู้ป่วย" : "รีเซ็ตข้อมูล"}
          </Button>
        </>
      }
    >
      <div className="rp">
        <div className="rp__warn">
          <TriangleAlert size={18} />
          <span>
            <b>ลบแล้วกู้คืนไม่ได้</b>
            {remove
              ? "ลบข้อมูลส่วนตัวและข้อมูลการรักษาด้านล่าง · บัญชีแอปยังอยู่ จองใหม่ได้ (HN ใหม่)"
              : "ลบเฉพาะข้อมูลการรักษาด้านล่าง · ข้อมูลส่วนตัวยังอยู่"}
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
        {app && <p className="rp__app">ผู้ป่วยใช้แอป ThaiWell · ข้อมูลในแอปจะถูกล้างตาม</p>}
        <label className="rp__confirm">
          <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />
          <span>
            เข้าใจแล้วว่าจะลบ{remove ? "" : "ข้อมูลการรักษาของ"} {p.name} และกู้คืนไม่ได้
          </span>
        </label>
      </div>
    </Dialog>
  );
}
