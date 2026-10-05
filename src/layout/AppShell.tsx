import { lazy, Suspense, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { clsx } from "clsx";
import bg from "../assets/backdrop/spa-room.jpg";
import { Dock } from "./Dock";
import { Tour } from "../features/Tour";
import { LiveBackdrop } from "./backdrop/LiveBackdrop";
import { useStore } from "../store/store";
import { useToast } from "../design-system";
import { startAutoUpdate } from "../autoUpdate";
import Dashboard from "../pages/dashboard/Dashboard";
import { finishEnter, useEntering, useSignedIn } from "../features/session";
import "./shell.css";

const Appointments = lazy(() => import("../pages/appointments/Appointments"));
const AppointmentDetail = lazy(() => import("../pages/appointments/AppointmentDetail"));
const Planner = lazy(() => import("../pages/planner/Planner"));
const Patients = lazy(() => import("../pages/patients/Patients"));
const PatientFormPage = lazy(() => import("../pages/patients/Patients").then((m) => ({ default: m.PatientFormPage })));
const Settings = lazy(() => import("../pages/settings/Settings"));
const DesignSystem = lazy(() => import("../pages/design-system/DesignSystem"));
const AISpotlight = lazy(() => import("../pages/ai/Assistant").then((m) => ({ default: m.AISpotlight })));
const Visits = lazy(() => import("../pages/visits/Visits"));
const Billing = lazy(() => import("../pages/billing/Billing"));
const Requests = lazy(() => import("../pages/requests/Requests"));
const Login = lazy(() => import("../pages/login/Login"));
const RoomScene = lazy(() => import("./room3d/RoomScene"));

function Page({ children }: { children: ReactNode }) {
  return (
    <motion.div
      className="shell__page"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, transition: { duration: 0.16 } }}
      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function AppShell() {
  const location = useLocation();
  const [spot, setSpot] = useState(false);
  const [spotEver, setSpotEver] = useState(false);
  useEffect(() => {
    if (spot) setSpotEver(true);
  }, [spot]);
  // ⌘K / Ctrl+K opens the AI spotlight
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSpot((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const [live, setLive] = useState(false);
  const toast = useToast();
  useEffect(() => {
    startAutoUpdate(() => {
      toast({ message: "มีเวอร์ชันใหม่ กำลังรีเฟรช…" });
      window.setTimeout(() => window.location.reload(), 1200);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pref = useStore().settings.backdrop;
  // old/legacy keys fall back to the reception, the default 3D scene
  const signedIn = useSignedIn();
  const entering = useEntering();
  // signed out we stand in front of the clinic, which only the reception scene has
  const mode = !signedIn ? "reception" : pref === "photo" || pref === "studio" || pref === "sala" ? pref : "reception";
  const isHome = location.pathname === "/" || !signedIn;

  return (
    <div className={clsx("shell", live && "shell--live", mode !== "photo" && "shell--room3d")}>
      <motion.div
        className="shell__bg"
        style={{ ["--bg-image" as string]: `url(${bg})` }}
        initial={{ scale: 1.06, opacity: 0 }}
        animate={{ scale: isHome ? 1 : 1.04, opacity: 1 }}
        transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
      />
      {mode !== "photo" ? (
        <Suspense fallback={null}>
          <RoomScene
            key={mode}
            variant={mode}
            work={!isHome}
            onReady={setLive}
            entrance={signedIn ? "inside" : entering ? "enter" : "outside"}
            onEntered={finishEnter}
          />
        </Suspense>
      ) : (
        <LiveBackdrop key="photo" work={!isHome} onReady={setLive} />
      )}
      <div className={clsx("shell__veil", !isHome && "shell__veil--work")} />

      {!signedIn ? (
        <Suspense fallback={null}>
          <Login />
        </Suspense>
      ) : (
        <>
      <AnimatePresence mode="wait">
        <Suspense fallback={null}>
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<Page><Dashboard /></Page>} />
            <Route path="/appointments" element={<Page><Appointments /></Page>} />
            <Route path="/appointments/:id" element={<Page><AppointmentDetail /></Page>} />
            <Route path="/planner" element={<Page><Planner /></Page>} />
            <Route path="/patients" element={<Page><Patients /></Page>} />
            <Route path="/patients/new" element={<Page><PatientFormPage /></Page>} />
            <Route path="/patients/:id/edit" element={<Page><PatientFormPage /></Page>} />
            <Route path="/patients/:id/screen" element={<Page><PatientFormPage screen /></Page>} />
            <Route path="/settings" element={<Page><Settings /></Page>} />
            <Route path="/visits" element={<Page><Visits /></Page>} />
            <Route path="/billing" element={<Page><Billing /></Page>} />
            <Route path="/requests" element={<Page><Requests /></Page>} />
            <Route path="/design-system" element={<Page><DesignSystem /></Page>} />
            <Route path="*" element={<Page><Dashboard /></Page>} />
          </Routes>
        </Suspense>
      </AnimatePresence>

      {/* sub-pages (register / edit / booking requests) are full-screen tasks: no dock, they have their own back button */}
      {!/^\/(patients\/(new|[^/]+\/(edit|screen))|requests|appointments\/[^/]+)$/.test(location.pathname) && <Dock onAssistant={() => setSpot(true)} />}
      <Suspense fallback={null}>{spotEver && <AISpotlight open={spot} onClose={() => setSpot(false)} />}</Suspense>
      <Tour />
        </>
      )}
    </div>
  );
}
