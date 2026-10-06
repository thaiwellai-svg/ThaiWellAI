import type { Patient } from "./types";

/**
 * Portraits: "Notionists" illustrations by Zoish via DiceBear — CC0 1.0, not real people.
 * Staff can pick one for a therapist (stored as "avatar:<key>" so it survives rebuilds), or take a real photo.
 * Real patient photos are captured in-app by staff (see features/photo.ts) and win over these.
 */
const files = import.meta.glob<string>("../assets/avatars/*.svg", { eager: true, query: "?url", import: "default" });
const DEMO = Object.fromEntries(Object.entries(files).map(([path, url]) => [path.split("/").pop()!.replace(".svg", ""), url]));

/** ตัวเลือก avatar ทั้งหมด (ชุดภาพเดียวกับระบบสาธิต) — ผู้บำบัดก่อน แล้วตามลำดับเลข */
const ORDER: Record<string, number> = { t: 0, p: 1, u: 2 };
export const AVATAR_CHOICES = Object.keys(DEMO).sort((a, b) => (a[0] === b[0] ? Number(a.slice(1)) - Number(b.slice(1)) : (ORDER[a[0]] ?? 3) - (ORDER[b[0]] ?? 3)));
/** รูปตั้งต้นของผู้ใช้แอปตามเพศ (ตรงกับในแอป ThaiWell AI) */
export const defaultAppAvatar = (gender?: string) => (gender === "หญิง" ? "avatar:u1" : "avatar:u2");
export const avatarUrl = (key: string) => DEMO[key];
export const avatarValue = (key: string) => `avatar:${key}`;
/** "avatar:t3" → URL ของภาพ · รูปถ่าย (data URL) → ตามเดิม */
export const resolvePhoto = (photo?: string) => (photo?.startsWith("avatar:") ? DEMO[photo.slice(7)] : photo);

export const patientPhoto = (p: Pick<Patient, "id" | "photo">) => resolvePhoto(p.photo) ?? DEMO[p.id];
export const therapistPhoto = (t: { id: string; photo?: string }) => resolvePhoto(t.photo) ?? DEMO[t.id];
