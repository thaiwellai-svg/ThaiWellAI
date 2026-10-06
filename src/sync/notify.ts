import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

/**
 * Push-style alerts for the clinic: a system notification (banner + sound) the moment the patient app sends something.
 * - native iPad app: Capacitor LocalNotifications, fired right away — shows even while the back-office is open
 * - browser: the Web Notifications API — permission is asked on the first tap, never on page load
 * Real remote push (APNs) needs a paid Apple developer team plus a push server; this stand-in works while the
 * back-office is open, because the cloud connection is what delivers the event.
 */
export const NAVIGATE = "thaiwell:navigate";

let seq = Math.floor(Date.now() / 1000) % 1_000_000; // notification ids must fit in an int
let ready = false;

const go = (link?: string) => {
  if (link) window.dispatchEvent(new CustomEvent(NAVIGATE, { detail: link }));
};

/** ask for permission (native: now · web: on the first tap) and route taps on a notification to its page */
export async function initPush() {
  if (Capacitor.isNativePlatform()) {
    try {
      const { display } = await LocalNotifications.checkPermissions();
      ready = display === "granted" || (await LocalNotifications.requestPermissions()).display === "granted";
      await LocalNotifications.addListener("localNotificationActionPerformed", (a) => go((a.notification.extra as { link?: string } | undefined)?.link));
    } catch {
      ready = false;
    }
    return;
  }
  if (typeof Notification === "undefined") return;
  ready = Notification.permission === "granted";
  if (Notification.permission === "default") {
    const ask = () => {
      void Notification.requestPermission().then((p) => {
        ready = p === "granted";
      });
    };
    window.addEventListener("pointerdown", ask, { once: true });
  }
}

/** show a system notification now; tapping it opens `link` in the back-office */
export async function pushNotify(title: string, body: string, link?: string) {
  if (!ready) return;
  if (Capacitor.isNativePlatform()) {
    await LocalNotifications.schedule({ notifications: [{ id: ++seq, title, body, sound: "default", extra: { link } }] }).catch(() => undefined);
    return;
  }
  try {
    const n = new Notification(title, { body, tag: `tw-${++seq}` });
    n.onclick = () => {
      window.focus();
      go(link);
      n.close();
    };
  } catch {
    /* notifications blocked */
  }
}
