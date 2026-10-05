import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, Reorder, motion, useDragControls } from "framer-motion";
import { GripVertical, RotateCcw, X } from "lucide-react";
import { clsx } from "clsx";
import "./workspace.css";

export interface PaneDef {
  id: string;
  /** fixed panes have a width; the flexible pane (undefined) takes the rest */
  width?: number;
  min?: number;
  max?: number;
  /** no ••• handle: can't be focused, moved or resized */
  locked?: boolean;
  /** animate in/out (e.g. a side box that opens and closes) */
  collapsible?: boolean;
  /** has the ••• handle and highlight, but can't be moved or resized — `menu` holds its only options */
  fixed?: boolean;
  /** custom content for the toolbar shown while focused (replaces the hint + reset) */
  menu?: ReactNode;
  /** extra toolbar buttons, shown before the close button */
  actions?: ReactNode;
  /** empty see-through gap (e.g. the room view between the dashboard columns) */
  ghost?: boolean;
  /** a function receives whether the pane is focused (in edit mode) */
  node: ReactNode | ((focused: boolean) => ReactNode);
}

type Layout = { order: string[]; widths: Record<string, number> };

/** iPad-style multi-pane workspace: ••• handle on each pane — tap to focus, drag to move, edge handle to resize. */
export function Workspace({ storageKey, panes, className, flexMin = 420 }: { storageKey: string; panes: PaneDef[]; className?: string; flexMin?: number }) {
  const defaults: Layout = { order: panes.map((p) => p.id), widths: Object.fromEntries(panes.filter((p) => p.width).map((p) => [p.id, p.width!])) };
  const [layout, setLayout] = useState<Layout>(() => {
    try {
      const s = JSON.parse(localStorage.getItem(storageKey) ?? "null") as Layout | null;
      return s ? { order: s.order, widths: { ...defaults.widths, ...s.widths } } : defaults;
    } catch {
      return defaults;
    }
  });
  const [focus, setFocus] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(layout));
    } catch {
      /* ignore */
    }
  }, [layout, storageKey]);
  // tap outside the focused pane → leave edit mode
  useEffect(() => {
    if (!focus) return;
    const onDown = (e: PointerEvent) => {
      const el = (e.target as HTMLElement).closest("[data-pane]");
      if (!el || el.getAttribute("data-pane") !== focus) setFocus(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFocus(null);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [focus]);

  const ids = panes.map((p) => p.id);
  const order = [...layout.order.filter((id) => ids.includes(id)), ...ids.filter((id) => !layout.order.includes(id))];
  const byId = Object.fromEntries(panes.map((p) => [p.id, p]));
  const flexIndex = order.findIndex((id) => !byId[id].width);

  // keep everything on screen: fixed panes + gaps + the flexible pane's minimum must fit the container
  const [cw, setCw] = useState(0);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const inner = () => {
      const cs = getComputedStyle(el);
      return el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    };
    const ro = new ResizeObserver(() => setCw(inner()));
    ro.observe(el);
    setCw(inner());
    return () => ro.disconnect();
  }, []);
  const GAP = 16;
  const FLEX_MIN = flexMin;
  const fixed = order.filter((id) => byId[id].width);
  const room = cw ? cw - GAP * (order.length - 1) - (flexIndex >= 0 ? FLEX_MIN : 0) : Infinity;
  /** fit widths into the room: the pane being dragged wins, the others give way down to their minimum */
  const fit = (widths: Record<string, number>, prefer?: string) => {
    const w: Record<string, number> = {};
    for (const id of fixed) w[id] = byId[id].locked || byId[id].fixed ? byId[id].width! : widths[id] ?? byId[id].width!;
    let over = fixed.reduce((n, id) => n + w[id], 0) - room;
    if (over <= 0) return w;
    // shrink others first (unlocked, then locked), then the preferred one
    const giveOrder = [...fixed.filter((id) => id !== prefer && !byId[id].locked && !byId[id].fixed), ...fixed.filter((id) => id !== prefer && byId[id].locked), ...(prefer ? [prefer] : [])];
    for (const id of giveOrder) {
      const can = w[id] - (byId[id].min ?? 220);
      const take = Math.min(can, over);
      w[id] -= take;
      over -= take;
      if (over <= 0) break;
    }
    return w;
  };
  const eff = fit(layout.widths);

  // fixed panes keep their slot while the others are dragged around them
  const reorder = (next: string[]) => {
    const moving = next.filter((id) => !byId[id]?.fixed);
    const placed = order.map((id) => (byId[id].fixed ? id : moving.shift()!));
    setLayout((l) => ({ ...l, order: [...placed, ...l.order.filter((id) => !placed.includes(id))] }));
  };
  const resize = (id: string, w: number) => setLayout((l) => ({ ...l, widths: { ...l.widths, ...fit({ ...l.widths, [id]: w }, id) } }));

  // panes added after the first paint slide in empty and fill once they land
  const booted = useRef(false);
  useEffect(() => {
    booted.current = true;
  }, []);

  return (
    <Reorder.Group as="div" axis="x" values={order} onReorder={reorder} className={clsx("ws", focus && "ws--editing", className)} ref={root}>
      <AnimatePresence initial={false}>
        {order.map((id, i) => (
          <Pane
            key={id}
            def={byId[id]}
            entering={booted.current}
            width={byId[id].width ? eff[id] : undefined}
            focused={focus === id}
            dimmed={!!focus && focus !== id}
            edge={byId[id].width && !byId[id].fixed ? (i < flexIndex ? "right" : "left") : null}
            neighbors={
              byId[id].width
                ? undefined
                : (["left", "right"] as const).map((side) => {
                    const n = byId[order[i + (side === "left" ? -1 : 1)]];
                    return n && n.width && !n.locked && !n.fixed ? { side, id: n.id, w: eff[n.id], min: n.min, max: n.max } : null;
                  })
            }
            onResizeOther={resize}
            flexMin={FLEX_MIN}
            onFocus={() => setFocus((f) => (f === id ? null : id))}
            onResize={(w) => resize(id, w)}
            onReset={() => {
              setLayout(defaults);
              setFocus(null);
            }}
          />
        ))}
      </AnimatePresence>
    </Reorder.Group>
  );
}

function Pane({
  def,
  width,
  focused,
  dimmed,
  edge,
  onFocus,
  onResize,
  onReset,
  neighbors,
  onResizeOther,
  flexMin,
  entering,
}: {
  entering?: boolean;
  neighbors?: ({ side: "left" | "right"; id: string; w: number; min?: number; max?: number } | null)[];
  onResizeOther?: (id: string, w: number) => void;
  flexMin?: number;
  def: PaneDef;
  width?: number;
  focused: boolean;
  dimmed: boolean;
  edge: "left" | "right" | null;
  onFocus: () => void;
  onResize: (w: number) => void;
  onReset: () => void;
}) {
  const controls = useDragControls();
  const down = useRef<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  // while a side box slides in/out its content keeps its final width and is clipped, so it never re-lays out per frame
  const [sliding, setSliding] = useState(false);
  // content of a box that just opened mounts after the slide, so the slide itself stays at 60fps
  const [ready, setReady] = useState(() => !(def.collapsible && entering));
  useEffect(() => {
    if (ready) return;
    const t = window.setTimeout(() => setReady(true), 600);
    return () => window.clearTimeout(t);
  }, [ready]);

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const x0 = e.clientX;
    const w0 = width ?? 300;
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - x0) * (edge === "left" ? -1 : 1);
      onResize(Math.round(Math.min(def.max ?? 560, Math.max(def.min ?? 220, w0 + dx))));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // the flexible pane grows by shrinking the neighbour on that side
  const startFlexResize = (n: { side: "left" | "right"; id: string; w: number; min?: number; max?: number }) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const x0 = e.clientX;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0;
      const w = n.side === "left" ? n.w + dx : n.w - dx;
      onResizeOther?.(n.id, Math.round(Math.min(n.max ?? 560, Math.max(n.min ?? 220, w))));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const size = width ? { width, flex: "0 0 auto" } : { flex: "1 1 0", minWidth: flexMin };
  return (
    <Reorder.Item
      as="div"
      value={def.id}
      data-pane={def.id}
      dragListener={false}
      dragControls={controls}
      onDragStart={() => setDragging(true)}
      onDragEnd={() => setDragging(false)}
      className={clsx("ws__pane", sliding && "is-sliding", focused && "is-focused", dimmed && "is-dimmed", dragging && "is-dragging", !width && "is-flex", def.locked && "is-locked", def.fixed && "is-fixed", def.ghost && "is-ghost")}
      style={{ ...size, ["--pw" as string]: width ? `${width}px` : undefined }}
      initial={def.collapsible ? { opacity: 0, width: 0 } : false}
      animate={def.collapsible ? { opacity: 1, width } : undefined}
      exit={def.collapsible ? { opacity: 0, width: 0, transition: { duration: 0.32, ease: [0.4, 0, 0.2, 1] } } : undefined}
      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      onAnimationStart={() => def.collapsible && setSliding(true)}
      onAnimationComplete={() => {
        setSliding(false);
        setReady(true);
      }}
    >
      {!def.locked && (
      <button
        type="button"
        className="ws__dots"
        aria-label="จัดตำแหน่งกล่อง"
        onPointerDown={(e) => {
          down.current = { x: e.clientX, y: e.clientY };
          if (!def.fixed) controls.start(e);
        }}
        onPointerUp={(e) => {
          const d = down.current;
          down.current = null;
          if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) onFocus();
        }}
      >
        <i />
        <i />
        <i />
      </button>
      )}

      <AnimatePresence>
        {focused && (
          <motion.div className="ws__bar" initial={{ opacity: 0, y: -6, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.97 }} transition={{ duration: 0.18 }}>
            {def.menu ?? (
              <>
                <span>{edge || neighbors?.some(Boolean) ? "ลากย้าย · ลากขอบปรับขนาด" : "ลาก ••• เพื่อย้าย"}</span>
                <button type="button" className="ws__icon" onClick={onReset} aria-label="คืนค่าเริ่มต้น" title="คืนค่าเริ่มต้น">
                  <RotateCcw size={14} />
                </button>
              </>
            )}
            {def.actions}
            <button type="button" className="ws__icon is-done" onClick={onFocus} aria-label="ปิด" title="ปิด">
              <X size={15} strokeWidth={2.4} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={clsx("ws__body", !ready && "is-pending")} style={sliding && width ? { minWidth: width, maxWidth: width } : undefined}>
        {ready ? (typeof def.node === "function" ? def.node(focused) : def.node) : <div className="panel ws__ghost"><div className="sheet" /></div>}
      </div>

      {focused &&
        neighbors?.map(
          (n) =>
            n && (
              <motion.span key={n.side} className={clsx("ws__grip", `is-${n.side}`)} onPointerDown={startFlexResize(n)} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} aria-label="ปรับความกว้าง">
                <GripVertical size={14} />
              </motion.span>
            ),
        )}
      {focused && edge && (
        <motion.span className={clsx("ws__grip", `is-${edge}`)} onPointerDown={startResize} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} aria-label="ปรับความกว้าง">
          <GripVertical size={14} />
        </motion.span>
      )}
    </Reorder.Item>
  );
}
