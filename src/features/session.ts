import { useSyncExternalStore } from "react";

/**
 * Demo sign-in state. There is no real auth backend yet — this only remembers
 * whether someone pressed "เข้าสู่ระบบ" on this device. No password is stored.
 *
 * Signing in plays an entrance first: the 3D scene opens the clinic doors and
 * glides inside, then calls finishEnter(). A fallback timer signs in anyway
 * when there is no 3D scene (photo backdrop, WebGL unavailable).
 */
const KEY = "thaiwell.session";
const listeners = new Set<() => void>();
let entering = false;
let fallback = 0;

const readSignedIn = () => {
  try {
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
};
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
