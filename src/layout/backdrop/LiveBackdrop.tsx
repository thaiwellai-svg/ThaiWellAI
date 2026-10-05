import { useEffect, useRef, useState } from "react";
import { SCENE } from "./scene";
import { FRAG, MAX_LIGHTS, VERT } from "./shader";
import "./backdrop.css";

/**
 * The spa room, alive: depth-map parallax, depth of field with tap-to-focus,
 * flickering candlelight, aroma smoke, drifting dust. Falls back to the static
 * photo (painted by the shell underneath) if WebGL is unavailable.
 */
interface Props {
  /** work pages: heavy soft blur + dim instead of the CSS backdrop veil */
  work: boolean;
  onReady?: (ready: boolean) => void;
}

/** Figma fill: 157.36% frame width, anchored 74.8% / 100% (same maths as .shell__bg). */
function placement(w: number, h: number) {
  const imgW = Math.max(1.5736 * w, 1.1895 * h * 1.7648);
  const imgH = imgW / SCENE.aspect;
  return { x: (w - imgW) * 0.748, y: (h - imgH) * 1.0, w: imgW, h: imgH };
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.decoding = "async";
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = src;
  });
}

export function LiveBackdrop({ work, onReady }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const workRef = useRef(work);
  workRef.current = work;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const gl = cv.getContext("webgl", { antialias: false, alpha: false, powerPreference: "high-performance" });
    if (!gl) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
      return s;
    };
    let prog: WebGLProgram;
    try {
      prog = gl.createProgram()!;
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error("link");
    } catch (e) {
      console.warn("LiveBackdrop disabled:", e);
      return;
    }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    const U = (n: string) => gl.getUniformLocation(prog, n);

    // static light uniforms
    const pack = (xs: { x: number; y: number; size?: number; strength?: number }[], n: number) => {
      const a = new Float32Array(n * 4);
      xs.slice(0, n).forEach((l, i) => a.set([l.x, l.y, l.size ?? l.strength ?? 1, i * 1.618 + 0.37], i * 4));
      return a;
    };
    gl.uniform4fv(U("uFlames"), pack(SCENE.flames, MAX_LIGHTS));
    gl.uniform4fv(U("uGlows"), pack(SCENE.glows, MAX_LIGHTS));
    gl.uniform4fv(U("uSmoke"), pack(SCENE.smoke, 3));
    gl.uniform1f(U("uFlameN"), Math.min(SCENE.flames.length, MAX_LIGHTS));
    gl.uniform1f(U("uGlowN"), Math.min(SCENE.glows.length, MAX_LIGHTS));
    gl.uniform1f(U("uMotion"), reduced ? 0 : 1);
    const u = {
      res: U("uRes"), dpr: U("uDpr"), rect: U("uRect"), zoom: U("uZoom"), time: U("uTime"), par: U("uPar"),
      focus: U("uFocus"), dof: U("uDof"), haze: U("uHaze"), dim: U("uDim"),
    };

    // live state — eased every frame toward its target
    const s = {
      par: [0, 0], parT: [0, 0],
      focus: SCENE.focus, focusT: SCENE.focus,
      haze: workRef.current ? 16 : 0, dim: workRef.current ? 0.34 : 0,
      dof: 4.5,
      dragging: false,
    };
    let raf = 0;
    let last = 0;
    let disposed = false;
    const t0 = performance.now();

    const upload = (unit: number, img: TexImageSource) => {
      const tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    };

    const zoom = () => (workRef.current ? 1.07 : 1.045);
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - last < 1000 / 31) return; // ~30fps: slow ambience, saves battery under the glass UI
      last = now;
      const isWork = workRef.current;
      const k = 0.08;
      const idle = [0, 0]; // locked-off: no camera drift
      const tx = s.dragging ? s.parT[0] : s.parT[0] + idle[0];
      const ty = s.dragging ? s.parT[1] : s.parT[1] + idle[1];
      s.par[0] += (tx - s.par[0]) * k;
      s.par[1] += (ty - s.par[1]) * k;
      s.focus += (s.focusT - s.focus) * 0.09;
      s.haze += ((isWork ? 16 : 0) - s.haze) * 0.1;
      s.dim += ((isWork ? 0.34 : 0) - s.dim) * 0.1;

      const w = window.innerWidth;
      const h = window.innerHeight;
      // blurred work pages don't need full resolution
      const dpr = Math.min(window.devicePixelRatio || 1, isWork ? 0.75 : 1.25);
      const cw = Math.round(w * dpr);
      const ch = Math.round(h * dpr);
      if (cv.width !== cw || cv.height !== ch) {
        cv.width = cw;
        cv.height = ch;
      }
      gl.viewport(0, 0, cw, ch);
      const r = placement(w, h);
      gl.uniform2f(u.res, w, h);
      gl.uniform1f(u.dpr, dpr);
      gl.uniform4f(u.rect, r.x, r.y, r.w, r.h);
      gl.uniform1f(u.zoom, zoom());
      gl.uniform1f(u.time, (now - t0) / 1000);
      gl.uniform2f(u.par, reduced ? 0 : s.par[0], reduced ? 0 : s.par[1]);
      gl.uniform1f(u.focus, s.focus);
      gl.uniform1f(u.dof, isWork ? 0 : s.dof);
      gl.uniform1f(u.haze, s.haze);
      gl.uniform1f(u.dim, s.dim);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    Promise.all([loadImage(SCENE.image), loadImage(SCENE.depth)])
      .then(([img, dep]) => {
        if (disposed) return;
        upload(0, img);
        upload(1, dep);
        gl.uniform1i(U("uImg"), 0);
        gl.uniform1i(U("uDepth"), 1);
        raf = requestAnimationFrame(frame);
        requestAnimationFrame(() => {
          setReady(true);
          onReady?.(true);
        });
      })
      .catch(() => onReady?.(false));

    const onLost = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(raf);
      setReady(false);
      onReady?.(false);
    };
    cv.addEventListener("webglcontextlost", onLost);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      cv.removeEventListener("webglcontextlost", onLost);
      gl.deleteProgram(prog);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <canvas ref={canvas} className={`live-bg${ready ? " live-bg--on" : ""}`} aria-hidden />
    </>
  );
}
