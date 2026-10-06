import { useEffect, useRef } from "react";

/**
 * Siri-style flowing waveform: three layered sine ribbons whose height follows the live mic level.
 * `level` 0..1 (smoothed here) · `calm` flattens it into a slow shimmer while the AI is working.
 */
export function VoiceWave({ level, calm = false, speak = false, height = 96 }: { level: number; calm?: boolean; /** the AI is talking: a speech-like rhythm without a mic level */ speak?: boolean; height?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  const live = useRef({ level, calm, speak });
  live.current = { level, calm, speak };

  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const paths = [...svg.querySelectorAll("path")];
    const W = 320;
    const H = height;
    const mid = H / 2;
    // each ribbon: frequency, speed, phase offset, amplitude share
    const waves = [
      { f: 1.6, s: 1.9, o: 0, a: 1 },
      { f: 2.3, s: -1.4, o: 1.7, a: 0.72 },
      { f: 3.1, s: 2.6, o: 3.1, a: 0.5 },
    ];
    let amp = 0.08;
    let raf = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      const t = (now - t0) / 1000;
      // idle breathing so the line never looks dead, speech lifts it to full height
      const breathe = 0.16 + 0.06 * Math.sin(t * 2.4);
      const talk = 0.28 + 0.55 * Math.abs(Math.sin(t * 4.7) * Math.sin(t * 1.9 + 1));
      const target = live.current.speak ? talk : live.current.calm ? 0.07 + 0.04 * Math.sin(t * 2) : Math.min(1, breathe + live.current.level * 0.85);
      amp += (target - amp) * (target > amp ? 0.35 : 0.12); // fast attack, slow release // ease towards the mic level
      waves.forEach((w, i) => {
        let d = `M0 ${mid}`;
        for (let x = 0; x <= W; x += 6) {
          const k = x / W;
          const env = Math.sin(Math.PI * k) ** 2; // taper both ends
          const y = mid + Math.sin(k * Math.PI * 2 * w.f + t * w.s + w.o) * env * amp * w.a * (mid - 4);
          d += ` L${x} ${y.toFixed(1)}`;
        }
        paths[i].setAttribute("d", d);
      });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [height]);

  return (
    <svg ref={ref} className="vw" viewBox={`0 0 320 ${height}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="vw-a" x1="0" x2="1">
          <stop offset="0" stopColor="#4c845a" stopOpacity="0" />
          <stop offset="0.5" stopColor="#4c845a" />
          <stop offset="1" stopColor="#4c845a" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="vw-b" x1="0" x2="1">
          <stop offset="0" stopColor="#2f8f9a" stopOpacity="0" />
          <stop offset="0.5" stopColor="#2f8f9a" />
          <stop offset="1" stopColor="#2f8f9a" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="vw-c" x1="0" x2="1">
          <stop offset="0" stopColor="#7a5af0" stopOpacity="0" />
          <stop offset="0.5" stopColor="#7a5af0" />
          <stop offset="1" stopColor="#7a5af0" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path stroke="url(#vw-a)" strokeWidth="3.2" />
      <path stroke="url(#vw-b)" strokeWidth="2.4" />
      <path stroke="url(#vw-c)" strokeWidth="1.8" />
    </svg>
  );
}
