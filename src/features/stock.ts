import type { useStore } from "../store/store";

type Store = ReturnType<typeof useStore>;

/** deduct the supplies a finished session used (called once when the treatment record is saved) */
export function deductStock(store: Store, apptId: string, serviceId: string, who: string) {
  const list = store.biz.usage[serviceId] ?? [];
  if (!list.length || store.biz.moves.some((m) => m.apptId === apptId && m.kind === "use")) return;
  const at = new Date().toISOString();
  store.dispatch({
    type: "biz",
    cat: "คลังสินค้า",
    log: `ตัดสต็อก ${store.serviceById(serviceId).name}: ${list.map((u) => `${store.biz.items.find((i) => i.id === u.itemId)?.name} ${u.qty}`).join(", ")}`,
    update: (b) => ({
      ...b,
      items: b.items.map((i) => {
        const u = list.find((x) => x.itemId === i.id);
        return u ? { ...i, stock: i.stock - u.qty } : i;
      }),
      moves: [...list.map((u, k) => ({ id: `m${Date.now().toString(36)}${k}`, at, itemId: u.itemId, qty: -u.qty, kind: "use" as const, apptId, by: who })), ...b.moves],
    }),
  });
}
