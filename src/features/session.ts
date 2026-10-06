import { useSyncExternalStore } from "react";
import { LIVE } from "../data/mode";
import { cloud } from "../sync/cloud";

/**
 * Sign-in state. ใช้งานจริง: บัญชีคลินิกใน Supabase (clinicSignIn) · สาธิต: จำแค่ว่ากดเข้าสู่ระบบแล้ว
 *
 * Signing in plays an entrance first: the 3D scene opens the clinic doors and
 * glides inside, then calls finishEnter(). A fallback timer signs in anyway
 * when there is no 3D scene (photo backdrop, WebGL unavailable).
 */
const KEY = "thaiwell.session";
const AUTH_KEY = "thaiwell.clinic.auth";
const listeners = new Set<() => void>();
let entering = false;
let fallback = 0;

const readSignedIn = () => {
  try {
    // ใช้งานจริง: ต้องมีการเข้าสู่ระบบบัญชีคลินิกค้างไว้ (ตรวจกับ Supabase อีกครั้งด้านล่าง)
    if (LIVE) return localStorage.getItem(KEY) !== "out" && !!localStorage.getItem(AUTH_KEY);
    return localStorage.getItem(KEY) !== "out";
  } catch {
    return true;
  }
};
let signedIn = readSignedIn();
const emit = () => listeners.forEach((l) => l());
const persist = (v: boolean) => {
  try {
    if (v) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, "out");
  } catch {
    /* storage unavailable — state lives for this tab only */
  }
};

export const signIn = () => {
  window.clearTimeout(fallback);
  entering = false;
  signedIn = true;
  persist(true);
  emit();
};
export const signOut = () => {
  window.clearTimeout(fallback);
  entering = false;
  signedIn = false;
  persist(false);
  emit();
  // ใช้งานจริง: ออกจากบัญชี แล้วเริ่มหน้าใหม่ (ล้างข้อมูลคลินิกที่โหลดไว้ในหน่วยความจำ)
  if (LIVE) void cloud.auth.signOut().finally(() => window.location.reload());
};

const TH: [RegExp, string][] = [
  [/invalid login credentials/i, "อีเมลหรือรหัสผ่านไม่ถูกต้อง"],
  [/email not confirmed/i, "บัญชีนี้ยังไม่ได้ยืนยันอีเมล"],
  [/rate limit|too many/i, "ลองบ่อยเกินไป รอสักครู่แล้วลองใหม่"],
  [/fetch|network/i, "เชื่อมต่ออินเทอร์เน็ตไม่ได้"],
];
/** เข้าสู่ระบบบัญชีคลินิก · คืนข้อความผิดพลาด (ไม่มี = สำเร็จ) */
export async function clinicSignIn(email: string, password: string): Promise<string | null> {
  const { error } = await cloud.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) return TH.find(([re]) => re.test(error.message))?.[1] ?? `เข้าสู่ระบบไม่สำเร็จ (${error.message})`;
  // ต้องเป็นบัญชีคลินิก (บัญชีผู้ใช้แอปเข้าหลังบ้านไม่ได้)
  const { data } = await cloud.rpc("is_clinic");
  if (data !== true) {
    await cloud.auth.signOut();
    return "บัญชีนี้ไม่ใช่บัญชีคลินิก";
  }
  return null;
}

// ใช้งานจริง: การเข้าสู่ระบบในเครื่องหมดอายุ/ถูกออก → กลับหน้าเข้าสู่ระบบ
if (LIVE)
  void cloud.auth.getSession().then(({ data }) => {
    if (!data.session && signedIn) {
      signedIn = false;
      persist(false);
      emit();
    }
  });
/** start the door-and-glide entrance; signs in when it finishes (or after `maxMs`) */
export const beginEnter = (maxMs = 6000) => {
  if (entering || signedIn) return;
  entering = true;
  emit();
  fallback = window.setTimeout(signIn, maxMs);
};
export const finishEnter = () => entering && signIn();

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
export const useSignedIn = () => useSyncExternalStore(subscribe, () => signedIn, () => true);
export const useEntering = () => useSyncExternalStore(subscribe, () => entering, () => false);
