import { useMemo } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { useStore } from "../store/store";
import { Button, Drawer, stagger, fadeUp } from "../design-system";
import { creditInfo, evaluateScreening } from "../data/domain";
import { todayISO } from "../data/thaiDate";
import sparkle from "../assets/figma/ai-sparkle.png";

interface Insight {
  tone: "stop" | "caution" | "info" | "ok";
  title: string;
  body: string;
  to?: string;
  cta?: string;
}

/**
 * Daily brief. Every insight is computed from records by explicit rules so each
 * line can be traced to its source — the AI layer only phrases, never decides.
 */
export type { Insight };

export function useInsights() {
  const store = useStore();
  return useMemo<Insight[]>(() => {
    const today = todayISO();
    const out: Insight[] = [];
    const flagged = store.requests.filter((r) => evaluateScreening(r.screening, store.settings).some((f) => f.level === "stop"));
    if (flagged.length)
      out.push({
        tone: "stop",
        title: `คำขอ ${flagged.length} รายการมีข้อห้ามจากแบบคัดกรอง`,
        body: flagged.map((r) => store.patientById(r.patientId).name).join(", ") + " — ควรให้แพทย์แผนไทยประเมินก่อนอนุมัติ",
        to: "/requests",
        cta: "ตรวจคำขอ",
      });
    const lowCredit = store.patients.filter((p) => {
      const c = creditInfo(p, store.appointments);
      return c && c.remaining <= 1;
    });
    if (lowCredit.length)
      out.push({
        tone: "caution",
        title: `ผู้ป่วย ${lowCredit.length} รายเครดิตใกล้หมด`,
        body: "นัดครั้งถัดไปอาจเกินแผนการรักษา แนะนำนัดพบแพทย์เพื่อประเมินผลและต่อแผน",
        to: "/patients?filter=low",
        cta: "ดูรายชื่อ",
      });
    const todays = store.appointments.filter((a) => a.date === today);
    const absent = todays.filter((a) => a.status === "absent");
    if (absent.length)
      out.push({
        tone: "info",
        title: `${absent.length} รายไม่มาตามนัดวันนี้`,
        body: "ส่งข้อความผ่านแอป ThaiWell AI เพื่อเลื่อนนัด และคืนเครดิตคิวให้ผู้ป่วยในแผนรักษา",
        to: "/appointments",
        cta: "เปิดตารางนัด",
      });
    const done = todays.filter((a) => a.status === "done" && a.painAfter !== undefined);
    if (done.length) {
      const avg = done.reduce((s, a) => s + (a.painBefore - (a.painAfter ?? a.painBefore)), 0) / done.length;
      out.push({
        tone: "ok",
        title: `Pain Score ลดลงเฉลี่ย ${avg.toFixed(1)} คะแนน`,
        body: `จาก ${done.length} เคสที่รับบริการเสร็จวันนี้ · ระบบจะส่งแบบติดตามผลภายใน ${store.settings.followUpHours} ชม.`,
      });
    }
    const waiting = todays.filter((a) => a.status === "waiting").length;
    out.push({
      tone: "info",
      title: `เหลือคิวรอรับบริการ ${waiting} ราย`,
      body: "เตรียมห้องและวัดความดันผู้ป่วยก่อนเข้ารับบริการทุกราย",
      to: "/appointments",
      cta: "ดูคิว",
    });
    return out;
  }, [store]);
}

export function AIAssistant({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const insights = useInsights();

  const colors = { stop: "var(--red-600)", caution: "#e0a100", info: "var(--blue-500)", ok: "var(--green-500)" };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      leading={
        <span className="tw-avatar tw-avatar--lg" style={{ background: "linear-gradient(135deg,#4c845a,#8fbf7a)" }}>
          <img src={sparkle} alt="" width={22} height={22} style={{ filter: "invert(1)", transform: "scaleX(-1)" }} />
        </span>
      }
      title="ผู้ช่วย AI"
      subtitle="สรุปงานวันนี้ · ข้อเสนอแนะสำหรับเจ้าหน้าที่"
    >
      <motion.div variants={stagger(0.1, 0.08)} initial="hidden" animate="show" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {insights.map((i) => (
          <motion.div
            key={i.title}
            variants={fadeUp}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              padding: 16,
              borderRadius: 20,
              background: "var(--color-surface-sunken)",
              boxShadow: `inset 3px 0 0 ${colors[i.tone]}`,
            }}
          >
            <p className="tw-name">{i.title}</p>
            <p className="tw-meta" style={{ lineHeight: 1.55, whiteSpace: "normal" }}>
              {i.body}
            </p>
            {i.to && (
              <Button
                variant="ghost"
                style={{ alignSelf: "flex-start", marginLeft: -12 }}
                trailing={<ArrowRight size={14} />}
                onClick={() => {
                  onClose();
                  navigate(i.to!);
                }}
              >
                {i.cta}
              </Button>
            )}
          </motion.div>
        ))}
        <motion.div variants={fadeUp} className="alert alert--ok" style={{ marginTop: 6 }}>
          <ShieldCheck size={16} />
          <div>
            <b>AI เป็นผู้ช่วย ไม่ใช่ผู้ตัดสินใจ</b>
            ข้อเสนอแนะทั้งหมดคำนวณจากข้อมูลและกฎที่คลินิกกำหนด เจ้าหน้าที่และแพทย์แผนไทยเป็นผู้อนุมัติขั้นสุดท้าย
          </div>
        </motion.div>
      </motion.div>
    </Drawer>
  );
}
