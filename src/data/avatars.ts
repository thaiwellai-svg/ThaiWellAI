import type { Patient } from "./types";

/**
 * Demo portraits: "Notionists" illustrations by Zoish via DiceBear — CC0 1.0, not real people.
 * Real patient photos are captured in-app by staff (see features/photo.ts) and win over these.
 */
const files = import.meta.glob<string>("../assets/avatars/*.svg", { eager: true, query: "?url", import: "default" });
const DEMO = Object.fromEntries(Object.entries(files).map(([path, url]) => [path.split("/").pop()!.replace(".svg", ""), url]));

export const patientPhoto = (p: Pick<Patient, "id" | "photo">) => p.photo ?? DEMO[p.id];
export const therapistPhoto = (t: { id: string; photo?: string }) => t.photo ?? DEMO[t.id];
