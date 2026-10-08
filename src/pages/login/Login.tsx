import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, CalendarCheck2, Check, Eye, EyeOff, Sparkles, UsersRound } from "lucide-react";
import { useStore } from "../../store/store";
import { ease } from "../../design-system";
import { beginEnter, clinicSignIn, useEntering } from "../../features/session";
import { DEMO } from "../../data/mode";
import { TH_WEEKDAYS, thaiDateLong, todayISO } from "../../data/thaiDate";
import "./login.css";

const greeting = (h: number) => (h < 11 ? "สวัสดีตอนเช้า" : h < 13 ? "สวัสดีตอนสาย" : h < 17 ? "สวัสดีตอนบ่าย" : "สวัสดีตอนเย็น");

/** Lotus mark drawn stroke by stroke. */
function Lotus({ size = 64 }: { size?: number }) {
  const petals = [
    "M32 50 C22 40 22 22 32 10 C42 22 42 40 32 50 Z",
    "M32 50 C18 46 10 34 12 20 C24 24 32 36 32 50 Z",
    "M32 50 C46 46 54 34 52 20 C40 24 32 36 32 50 Z",
    "M32 50 C16 52 6 44 3 34 C16 32 28 40 32 50 Z",
    "M32 50 C48 52 58 44 61 34 C48 32 36 40 32 50 Z",
  ];
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
      {petals.map((d, i) => (
        <motion.path
          key={i}
          d={d}
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinejoin="round"
          initial={{ pathLength: 0, fillOpacity: 0 }}
          animate={{ pathLength: 1, fillOpacity: i === 0 ? 0.28 : 0.12 }}
          fill="currentColor"
          transition={{ pathLength: { duration: 1.4, delay: 0.2 + i * 0.14, ease: "easeInOut" }, fillOpacity: { duration: 0.8, delay: 1.3 + i * 0.1 } }}
        />
      ))}
      <motion.path
        d="M14 56 H50"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.9, delay: 1.1 }}
      />
    </svg>
  );
}

/** Sign-in — ใช้งานจริง: บัญชีคลินิกใน Supabase (ต้องเป็นอีเมลที่ลงไว้ใน tw_clinic_accounts) · สาธิต: รหัสอะไรก็ได้ */
export default function Login() {
  const store = useStore();
  const { settings } = store;
  // สาธิต: เติมไว้ให้กดเข้าได้เลย · ใช้งานจริง: บัญชีคลินิก ใส่รหัสเอง
  const [user, setUser] = useState(DEMO ? settings.staffEmail ?? "somsak@thaiwell.clinic" : "clinic@thaiwell.app");
  const [pw, setPw] = useState(DEMO ? "thaiwell2569" : "");
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [phase, setPhase] = useState<"idle" | "busy" | "done">("idle");
  const [now, setNow] = useState(() => new Date());
  const entering = useEntering();
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(t);
  }, []);

  const today = todayISO();

  const valid = !!user.trim() && !!pw;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || phase !== "idle") return;
    setPhase("busy");
    setError(null);
    const go = () => {
      setPhase("done");
      // card fades, then the doors open and the camera glides into the lobby
      window.setTimeout(() => beginEnter(), 250);
    };
    if (DEMO) {
      window.setTimeout(go, 500);
      return;
    }
    void clinicSignIn(user, pw).then((err) => {
      if (err) {
        setError(err);
        setPhase("idle");
      } else go();
    });
  };

  // drifting sparkles
  const motes = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => ({
        left: (i * 37) % 100,
        size: 2 + ((i * 7) % 4),
        delay: (i * 0.9) % 9,
        dur: 9 + ((i * 5) % 8),
      })),
    [],
  );

  const time = now.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });

  return (
    <motion.div
      className="lg"
      initial={{ opacity: 0 }}
      animate={{ opacity: entering ? 0 : 1 }}
      transition={{ duration: entering ? 0.5 : 0.6, ease: ease.out }}
      style={{ pointerEvents: entering ? "none" : undefined }}
    >
      {/* atmosphere */}
      <div className="lg__shade" />
      <div className="lg__aurora lg__aurora--a" />
      <div className="lg__aurora lg__aurora--b" />
      <div className="lg__aurora lg__aurora--c" />
      <div className="lg__motes" aria-hidden>
        {motes.map((m, i) => (
          <i key={i} style={{ left: `${m.left}%`, width: m.size, height: m.size, animationDelay: `${m.delay}s`, animationDuration: `${m.dur}s` }} />
        ))}
      </div>

      <div className="lg__grid">
        {/* ── brand side ── */}
        <section className="lg__hero">
          <motion.div className="lg__clock" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.6 }}>
            <b>{time}</b>
            <span>
              {TH_WEEKDAYS[now.getDay()]} · {thaiDateLong(today).replace(/^วัน\S+ที่ /, "")}
            </span>
          </motion.div>

          <div className="lg__brand">
            <motion.span className="lg__mark" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, ease: ease.out }}>
              <Lotus size={72} />
            </motion.span>
            <motion.h1 initial={{ opacity: 0, y: 24, letterSpacing: "0.2em" }} animate={{ opacity: 1, y: 0, letterSpacing: "-0.02em" }} transition={{ duration: 1.1, delay: 0.25, ease: ease.out }}>
              ThaiWell
            </motion.h1>
            <motion.p className="lg__tag" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.6 }}>
              ศาสตร์แพทย์แผนไทย <em>ดูแลด้วยใจ</em>
              <br />
              บริหารคลินิกด้วยระบบที่เข้าใจทุกคิว
            </motion.p>
          </div>

          <motion.ul
            className="lg__features"
            initial="hidden"
            animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.12, delayChildren: 0.9 } } }}
          >
            {[
              { icon: CalendarCheck2, label: "คิวและตารางนัด", desc: "เช็กเตียงและเวรให้อัตโนมัติ" },
              { icon: UsersRound, label: "ตารางงานผู้บำบัด", desc: "เวลา บริการ และวันลาในที่เดียว" },
              { icon: Sparkles, label: "เชื่อมแอป ThaiWell", desc: "รับคำขอจอง ส่งประวัติถึงผู้ป่วย" },
            ].map((f) => (
              <motion.li key={f.label} variants={{ hidden: { opacity: 0, x: -16 }, show: { opacity: 1, x: 0, transition: { duration: 0.5 } } }}>
                <span className="lg__fi">
                  <f.icon size={18} strokeWidth={1.8} />
                </span>
                <span>
                  <b>{f.label}</b>
                  <small>{f.desc}</small>
                </span>
              </motion.li>
            ))}
          </motion.ul>

        </section>

        {/* ── sign-in card ── */}
        <motion.form
          className="lg__card"
          onSubmit={submit}
          initial={{ opacity: 0, y: 30, scale: 0.97 }}
          animate={phase === "done" ? { opacity: 0, y: -10, scale: 1.03 } : { opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: phase === "done" ? 0.7 : 0.8, delay: phase === "done" ? 0.3 : 0.35, ease: ease.out }}
        >
          <div className="lg__head">
            <small>{greeting(now.getHours())}</small>
            <h2>เข้าสู่ระบบ</h2>
            <p>{settings.clinicName}</p>
          </div>

          <label className="lg__field">
            <span>อีเมลหรือชื่อผู้ใช้</span>
            <span className="lg__input">
              <input value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" placeholder="name@clinic.go.th" />
            </span>
          </label>
          <label className="lg__field">
            <span>
              รหัสผ่าน
              <button type="button" className="lg__link">
                ลืมรหัสผ่าน?
              </button>
            </span>
            <span className="lg__input">
              <input type={show ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
              <button type="button" aria-label={show ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"} onClick={() => setShow((v) => !v)}>
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </label>

          {error ? (
            <p className="lg__error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="lg__submit" disabled={!valid || phase !== "idle"} data-phase={phase}>
            <AnimatePresence mode="wait" initial={false}>
              {phase === "idle" && (
                <motion.span key="idle" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
                  เข้าสู่ระบบ <ArrowRight size={18} />
                </motion.span>
              )}
              {phase === "busy" && (
                <motion.span key="busy" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
                  <i className="lg__spin" /> กำลังตรวจสอบ…
                </motion.span>
              )}
              {phase === "done" && (
                <motion.span key="done" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }}>
                  <Check size={20} strokeWidth={3} /> ยินดีต้อนรับ
                </motion.span>
              )}
            </AnimatePresence>
          </button>

          {DEMO && <p className="lg__note">เวอร์ชันสาธิต · กดเข้าสู่ระบบได้เลย</p>}
        </motion.form>
      </div>
    </motion.div>
  );
}
