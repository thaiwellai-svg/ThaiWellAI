import { Capacitor } from "@capacitor/core";
import { cloud } from "./cloud";

/**
 * Web Push (เว็บคลินิก): แจ้งเตือนแม้ปิดแท็บ/ปิดเบราว์เซอร์
 * service worker (public/sw.js) รับ push · เครื่องนี้ลงทะเบียนใน push_subscriptions · ฟังก์ชัน push-notify ส่งเมื่อมีคำขอจองใหม่
 * iPad/iPhone: ต้อง "เพิ่มไปยังหน้าจอโฮม" ก่อน (iPadOS 16.4+) · แอป iPad (Capacitor) ไม่ใช้ทางนี้
 */
export const VAPID_PUBLIC_KEY = "BCeIWQ0uBr7Ktx4Um2zD8dlXGaQq2mqfs54s1Y1LPJxpmuXIahYQkCvGX7g1F56FeHH31qt69fx6L6d0P3cswXw";

export const webPushSupported = () => !Capacitor.isNativePlatform() && "serviceWorker" in navigator && "PushManager" in window && window.isSecureContext;

const keyBytes = (b64: string) => {
  const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

let reg: ServiceWorkerRegistration | null = null;
export async function registerPushWorker() {
  if (!webPushSupported()) return null;
  try {
    const base = import.meta.env.BASE_URL;
    reg = await navigator.serviceWorker.register(`${base}sw.js`, { scope: base });
    return reg;
  } catch {
    return null;
  }
}

/** สมัครรับ push ของเครื่องนี้ (ต้องได้สิทธิ์แจ้งเตือนแล้ว) แล้วบันทึกลงฐานข้อมูล */
export async function ensurePushSubscription(): Promise<boolean> {
  if (!webPushSupported() || Notification.permission !== "granted") return false;
  try {
    const r = reg ?? (await registerPushWorker());
    if (!r) return false;
    await navigator.serviceWorker.ready;
    const sub = (await r.pushManager.getSubscription()) ?? (await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }));
    const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
    const { error } = await cloud
      .from("push_subscriptions")
      .upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, device: navigator.userAgent.slice(0, 160), updated_at: new Date().toISOString() });
    if (error) console.warn("push subscribe", error.message);
    return !error;
  } catch (e) {
    console.warn("push subscribe", e);
    return false;
  }
}
