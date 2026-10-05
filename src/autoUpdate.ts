declare const __BUILD_ID__: string;

/**
 * Production builds don't hot-reload. Poll /version.json and reload when a newer build is served,
 * so the test iPad always shows the latest work. Pauses while the tab is hidden.
 */
export function startAutoUpdate(onUpdate: () => void) {
  if (import.meta.env.DEV) return;
  let stopped = false;
  const check = async () => {
    if (stopped || document.hidden) return;
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return;
      const { id } = (await res.json()) as { id: string };
      if (id && id !== __BUILD_ID__) {
        stopped = true;
        onUpdate();
      }
    } catch {
      /* server restarting — try again next tick */
    }
  };
  window.setInterval(check, 3000);
  document.addEventListener("visibilitychange", check);
}
