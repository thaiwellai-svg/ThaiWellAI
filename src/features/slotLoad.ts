import type { Appointment, ClinicSettings, Therapist } from "../data/types";
import { slotTimes } from "../data/seed";
import { staffState } from "../data/domain";

/**
 * Open places per start time on a date (cancelled / no-show free their bed).
 * With `staff`, a place also needs a therapist on shift who offers the service and is free.
 */
export function slotLoad(
  appointments: Appointment[],
  date: string,
  settings: ClinicSettings,
  staff?: { therapists: Therapist[]; serviceId: string },
) {
  const times = slotTimes(settings.openTime, settings.closeTime, settings.slotMinutes);
  const counts = new Map(times.map((t) => [t, 0]));
  for (const a of appointments) {
    if (a.date !== date || a.status === "cancelled" || a.status === "absent") continue;
    if (counts.has(a.start)) counts.set(a.start, counts.get(a.start)! + 1);
  }
  return times.map((t) => {
    const beds = Math.max(0, settings.bedsPerSlot - counts.get(t)!);
    const staffFree = staff
      ? staff.therapists.filter((th) => staffState(th, { date, start: t, serviceId: staff.serviceId }, appointments) === "free").length
      : beds;
    return { time: t, used: counts.get(t)!, free: Math.min(beds, staffFree) };
  });
}
