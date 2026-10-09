/* ThaiWell back-office: รับ Web Push แม้ปิดแท็บ · แตะแล้วเปิดหน้าที่เกี่ยวข้อง */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { title: "ThaiWell", body: e.data ? e.data.text() : "" };
  }
  e.waitUntil(
    (async () => {
      // เปิดหน้าเว็บอยู่และมองเห็น → หน้าเว็บแจ้งเตือนเองแล้ว ไม่ซ้ำ
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (wins.some((w) => w.visibilityState === "visible")) return;
      await self.registration.showNotification(d.title || "ThaiWell", {
        body: d.body || "",
        tag: d.tag,
        icon: "apple-touch-icon.png",
        badge: "apple-touch-icon.png",
        data: { link: d.link || "/" },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const base = self.registration.scope;
  const url = new URL((e.notification.data && e.notification.data.link ? e.notification.data.link : "/").replace(/^\//, ""), base).href;
  e.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of wins) {
        if (w.url.startsWith(base)) {
          await w.focus();
          w.postMessage({ type: "thaiwell:navigate", link: e.notification.data && e.notification.data.link });
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
