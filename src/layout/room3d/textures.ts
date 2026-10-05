import * as THREE from "three";

/** Every surface is painted procedurally — no downloaded assets, nothing to license. */

function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
}

function tex(c: HTMLCanvasElement, color = true, repeat?: [number, number]) {
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
}

/** Wood planks: base tone per plank, wavy grain, occasional knots, dark joints. */
export function woodTexture(opts: { vertical: boolean; plank: number; base: [number, number, number]; seed: number; size?: number; joints?: boolean }) {
  const S = opts.size ?? 1024;
  const r = rng(opts.seed);
  const [c, g] = canvas(S, S);
  const [b, gb] = canvas(S, S);
  gb.fillStyle = "#b0b0b0";
  gb.fillRect(0, 0, S, S);
  const n = Math.round(S / opts.plank);
  for (let i = 0; i < n; i++) {
    const [h, s, l] = opts.base;
    const lj = l + (r() - 0.5) * 9;
    const x0 = i * opts.plank;
    const fill = `hsl(${h + (r() - 0.5) * 6} ${s + (r() - 0.5) * 10}% ${lj}%)`;
    g.fillStyle = fill;
    if (opts.vertical) g.fillRect(x0, 0, opts.plank, S);
    else g.fillRect(0, x0, S, opts.plank);
    // grain
    const lines = 26 + Math.floor(r() * 18);
    for (let k = 0; k < lines; k++) {
      const off = r() * opts.plank;
      const amp = 1 + r() * 4;
      const freq = 0.004 + r() * 0.01;
      const ph = r() * 10;
      g.strokeStyle = `hsla(${h - 4} ${s}% ${lj - 8 - r() * 10}% / ${0.12 + r() * 0.25})`;
      g.lineWidth = 0.6 + r() * 1.8;
      g.beginPath();
      for (let t = 0; t <= S; t += 8) {
        const w = off + Math.sin(t * freq + ph) * amp + Math.sin(t * freq * 3.1 + ph * 2) * amp * 0.3;
        const x = x0 + Math.max(1, Math.min(opts.plank - 1, w));
        if (opts.vertical) (t ? g.lineTo(x, t) : g.moveTo(x, t));
        else (t ? g.lineTo(t, x) : g.moveTo(t, x));
      }
      g.stroke();
    }
    // knots
    if (r() < 0.35) {
      const kx = x0 + opts.plank * (0.3 + r() * 0.4);
      const ky = r() * S;
      for (let ring = 0; ring < 5; ring++) {
        g.strokeStyle = `hsla(${h - 6} ${s}% ${lj - 14}% / ${0.25 - ring * 0.04})`;
        g.lineWidth = 1.2;
        g.beginPath();
        if (opts.vertical) g.ellipse(kx, ky, 3 + ring * 3, 9 + ring * 6, 0, 0, Math.PI * 2);
        else g.ellipse(ky, kx, 9 + ring * 6, 3 + ring * 3, 0, 0, Math.PI * 2);
        g.stroke();
      }
    }
    // joints (colour + bump)
    if (opts.joints === false) continue;
    g.fillStyle = "rgba(20,10,4,0.75)";
    gb.fillStyle = "#1a1a1a";
    if (opts.vertical) {
      g.fillRect(x0, 0, 2, S);
      gb.fillRect(x0, 0, 3, S);
    } else {
      g.fillRect(0, x0, S, 2);
      gb.fillRect(0, x0, S, 3);
      // staggered butt joints on floor planks
      const jx = r() * S;
      g.fillRect(jx, x0, 2, opts.plank);
      gb.fillRect(jx, x0, 3, opts.plank);
    }
  }
  return { map: tex(c), bump: tex(b, false) };
}

export function linenTexture() {
  const S = 512;
  const r = rng(7);
  const [c, g] = canvas(S, S);
  g.fillStyle = "#f4efe6";
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 2600; i++) {
    const horizontal = i % 2 === 0;
    g.strokeStyle = `rgba(${150 + r() * 60},${140 + r() * 50},${120 + r() * 40},${0.05 + r() * 0.07})`;
    g.lineWidth = 0.6;
    g.beginPath();
    const p = r() * S;
    const a = r() * S;
    const len = 20 + r() * 80;
    if (horizontal) {
      g.moveTo(a, p);
      g.lineTo(a + len, p + (r() - 0.5));
    } else {
      g.moveTo(p, a);
      g.lineTo(p + (r() - 0.5), a + len);
    }
    g.stroke();
  }
  return tex(c, true, [3, 3]);
}

/** Elongated tropical leaf (banana/heliconia-like) with veins, alpha outside. */
export function leafTexture(hue = 118) {
  const [c, g] = canvas(256, 512);
  const grad = g.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, `hsl(${hue} 42% 18%)`);
  grad.addColorStop(0.5, `hsl(${hue + 6} 48% 30%)`);
  grad.addColorStop(1, `hsl(${hue} 42% 17%)`);
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(128, 504);
  g.bezierCurveTo(10, 400, 6, 120, 128, 8);
  g.bezierCurveTo(250, 120, 246, 400, 128, 504);
  g.fill();
  g.save();
  g.clip();
  g.strokeStyle = "rgba(210,240,170,0.45)";
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(128, 504);
  g.lineTo(128, 10);
  g.stroke();
  g.strokeStyle = "rgba(200,235,160,0.18)";
  g.lineWidth = 1.5;
  for (let y = 40; y < 490; y += 14) {
    g.beginPath();
    g.moveTo(128, y + 18);
    g.quadraticCurveTo(70, y + 6, 10, y - 10);
    g.moveTo(128, y + 18);
    g.quadraticCurveTo(186, y + 6, 246, y - 10);
    g.stroke();
  }
  // a couple of natural tears
  g.globalCompositeOperation = "destination-out";
  g.lineWidth = 3;
  for (const [x, y] of [[40, 220], [210, 330], [30, 390]] as const) {
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(128 + (x < 128 ? -30 : 30), y + 26);
    g.stroke();
  }
  g.restore();
  return tex(c);
}

export function rattanTexture() {
  const S = 512;
  const [c, g] = canvas(S, S);
  g.clearRect(0, 0, S, S);
  g.lineCap = "round";
  for (let i = -S; i < S * 2; i += 26) {
    g.strokeStyle = "rgba(190,140,80,1)";
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + S, S);
    g.stroke();
    g.beginPath();
    g.moveTo(i + S, 0);
    g.lineTo(i, S);
    g.stroke();
  }
  return tex(c, true, [6, 3]);
}

/** Radial soft sprite — steam, glow, dust. */
export function softTexture() {
  const [c, g] = canvas(128, 128);
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return tex(c);
}

export function flameTexture() {
  const [c, g] = canvas(64, 128);
  g.save();
  g.translate(32, 92);
  g.scale(1, 2.2);
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, 26);
  grad.addColorStop(0, "rgba(255,255,245,1)");
  grad.addColorStop(0.25, "rgba(255,235,160,1)");
  grad.addColorStop(0.55, "rgba(255,160,60,0.85)");
  grad.addColorStop(1, "rgba(255,90,20,0)");
  g.fillStyle = grad;
  g.beginPath();
  g.arc(0, 0, 26, 0, Math.PI * 2);
  g.fill();
  g.restore();
  // blue base
  const b = g.createRadialGradient(32, 108, 0, 32, 108, 8);
  b.addColorStop(0, "rgba(120,160,255,0.7)");
  b.addColorStop(1, "rgba(120,160,255,0)");
  g.fillStyle = b;
  g.fillRect(20, 96, 24, 24);
  return tex(c);
}

/** Dusk garden seen through the window: sky, layered foliage, warm garden lights. */
export function gardenTexture() {
  const W = 2048;
  const H = 1024;
  const r = rng(42);
  const [c, g] = canvas(W, H);
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#23324d");
  sky.addColorStop(0.45, "#58608a");
  sky.addColorStop(0.72, "#d99a72");
  sky.addColorStop(1, "#f1c38f");
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  // far tree line layers
  const layers = [
    { y: 0.62, amp: 60, col: "#3d4a55", n: 90 },
    { y: 0.7, amp: 80, col: "#26352f", n: 60 },
    { y: 0.8, amp: 110, col: "#15221b", n: 40 },
  ];
  for (const L of layers) {
    g.fillStyle = L.col;
    g.beginPath();
    g.moveTo(0, H);
    for (let i = 0; i <= L.n; i++) {
      const x = (i / L.n) * W;
      const y = L.y * H - r() * L.amp - Math.sin(i * 0.7) * L.amp * 0.3;
      g.lineTo(x, y);
    }
    g.lineTo(W, H);
    g.fill();
  }
  // palm silhouettes
  const palm = (x: number, base: number, h: number) => {
    g.strokeStyle = "#0e1712";
    g.lineWidth = 10;
    g.beginPath();
    g.moveTo(x, base);
    g.quadraticCurveTo(x + 30, base - h * 0.5, x + 10, base - h);
    g.stroke();
    const tx = x + 10;
    const ty = base - h;
    g.fillStyle = "#0e1712";
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      g.beginPath();
      g.moveTo(tx, ty);
      g.quadraticCurveTo(tx + Math.cos(a) * 120, ty + Math.sin(a) * 40 - 50, tx + Math.cos(a) * 230, ty + Math.sin(a) * 80 + 40);
      g.quadraticCurveTo(tx + Math.cos(a) * 110, ty + Math.sin(a) * 30 - 20, tx, ty);
      g.fill();
    }
  };
  palm(340, H, 620);
  palm(1560, H, 700);
  palm(1180, H, 460);
  // warm garden lamps / fireflies
  for (let i = 0; i < 70; i++) {
    const x = r() * W;
    const y = H * (0.66 + r() * 0.32);
    const rad = 2 + r() * 7;
    const gl = g.createRadialGradient(x, y, 0, x, y, rad * 4);
    gl.addColorStop(0, "rgba(255,214,140,0.95)");
    gl.addColorStop(1, "rgba(255,180,90,0)");
    g.fillStyle = gl;
    g.fillRect(x - rad * 4, y - rad * 4, rad * 8, rad * 8);
  }
  return tex(c);
}

/** Vertical gradient for candle wax: glows warm at the top. */
export function waxGlowTexture() {
  const [c, g] = canvas(4, 128);
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, "rgb(255,255,255)");
  grad.addColorStop(0.25, "rgb(120,120,120)");
  grad.addColorStop(1, "rgb(0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 128);
  return tex(c, false);
}

/** Basket-weave jute for the rug: colour + bump. */
export function juteTexture() {
  const S = 1024;
  const r = rng(99);
  const [c, g] = canvas(S, S);
  const [b, gb] = canvas(S, S);
  g.fillStyle = "#8a6a45";
  g.fillRect(0, 0, S, S);
  gb.fillStyle = "#555";
  gb.fillRect(0, 0, S, S);
  const cell = 32;
  for (let y = 0; y < S; y += cell)
    for (let x = 0; x < S; x += cell) {
      const horiz = ((x + y) / cell) % 2 === 0;
      for (let k = 0; k < 4; k++) {
        const l = 38 + r() * 14;
        g.fillStyle = `hsl(${32 + r() * 6} ${38 + r() * 10}% ${l}%)`;
        gb.fillStyle = `rgb(${150 + r() * 80},${150 + r() * 80},${150 + r() * 80})`;
        if (horiz) {
          g.fillRect(x + 1, y + k * 8 + 1, cell - 2, 6);
          gb.fillRect(x + 1, y + k * 8 + 1, cell - 2, 6);
        } else {
          g.fillRect(x + k * 8 + 1, y + 1, 6, cell - 2);
          gb.fillRect(x + k * 8 + 1, y + 1, 6, cell - 2);
        }
      }
    }
  // loose fibres
  for (let i = 0; i < 1400; i++) {
    g.strokeStyle = `rgba(210,180,130,${0.08 + r() * 0.12})`;
    g.lineWidth = 0.6;
    g.beginPath();
    const x = r() * S;
    const y = r() * S;
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 18, y + (r() - 0.5) * 18);
    g.stroke();
  }
  return { map: tex(c, true, [2.5, 1.6]), bump: tex(b, false, [2.5, 1.6]) };
}

/** Monstera leaf: heart shape, fenestration splits, midrib + veins. */
export function monsteraTexture() {
  const [c, g] = canvas(512, 512);
  const grad = g.createRadialGradient(256, 300, 20, 256, 280, 280);
  grad.addColorStop(0, "#3f7a35");
  grad.addColorStop(0.6, "#2b5a26");
  grad.addColorStop(1, "#1c3f1a");
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(256, 470);
  g.bezierCurveTo(60, 430, 10, 260, 90, 120);
  g.bezierCurveTo(150, 30, 220, 40, 250, 90);
  g.bezierCurveTo(290, 40, 360, 30, 420, 120);
  g.bezierCurveTo(500, 260, 450, 430, 256, 470);
  g.fill();
  // veins
  g.strokeStyle = "rgba(170,210,120,0.55)";
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(256, 470);
  g.lineTo(252, 95);
  g.stroke();
  g.lineWidth = 2;
  g.strokeStyle = "rgba(160,200,110,0.3)";
  for (let i = 0; i < 9; i++) {
    const y = 140 + i * 36;
    g.beginPath();
    g.moveTo(254, y + 20);
    g.quadraticCurveTo(170, y, 60 + i * 6, y - 30 + i * 8);
    g.moveTo(254, y + 20);
    g.quadraticCurveTo(340, y, 452 - i * 6, y - 30 + i * 8);
    g.stroke();
  }
  // splits between veins + a few holes (the monstera signature)
  g.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 7; i++) {
    const y = 170 + i * 40;
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(40 + i * 8, y - 40 + i * 8);
    g.quadraticCurveTo(130, y - 12, 175, y + 4);
    g.moveTo(472 - i * 8, y - 40 + i * 8);
    g.quadraticCurveTo(382, y - 12, 337, y + 4);
    g.stroke();
    if (i % 2 === 1) {
      g.beginPath();
      g.ellipse(205, y + 12, 7, 12, -0.5, 0, Math.PI * 2);
      g.ellipse(307, y + 12, 7, 12, 0.5, 0, Math.PI * 2);
      g.fill();
    }
  }
  return tex(c);
}

/** Narrow leaflet (areca palm) and striped sansevieria blade. */
export function leafletTexture() {
  const [c, g] = canvas(64, 512);
  const grad = g.createLinearGradient(0, 0, 64, 0);
  grad.addColorStop(0, "#2d5e22");
  grad.addColorStop(0.5, "#5a9a3a");
  grad.addColorStop(1, "#2d5e22");
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(32, 510);
  g.quadraticCurveTo(0, 260, 32, 2);
  g.quadraticCurveTo(64, 260, 32, 510);
  g.fill();
  g.strokeStyle = "rgba(200,240,150,0.5)";
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(32, 510);
  g.lineTo(32, 8);
  g.stroke();
  return tex(c);
}
export function snakePlantTexture() {
  const r = rng(5);
  const [c, g] = canvas(128, 512);
  g.fillStyle = "#2c4a2a";
  g.beginPath();
  g.moveTo(10, 512);
  g.quadraticCurveTo(0, 200, 64, 0);
  g.quadraticCurveTo(128, 200, 118, 512);
  g.fill();
  g.save();
  g.clip();
  for (let y = 0; y < 512; y += 14 + r() * 10) {
    g.strokeStyle = `rgba(150,180,110,${0.25 + r() * 0.3})`;
    g.lineWidth = 3 + r() * 4;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= 128; x += 16) g.lineTo(x, y + Math.sin(x * 0.08 + y) * 5);
    g.stroke();
  }
  g.strokeStyle = "#c9b24a";
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(12, 512);
  g.quadraticCurveTo(4, 200, 64, 2);
  g.moveTo(116, 512);
  g.quadraticCurveTo(124, 200, 64, 2);
  g.stroke();
  g.restore();
  return tex(c);
}

/** Richer dusk garden: clouds, hills, clustered foliage, detailed palms, lamps. */
export function gardenTextureHD() {
  const W = 3072;
  const H = 1536;
  const r = rng(77);
  const [c, g] = canvas(W, H);
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#1c2944");
  sky.addColorStop(0.35, "#43507a");
  sky.addColorStop(0.58, "#a07a8a");
  sky.addColorStop(0.72, "#e3a275");
  sky.addColorStop(1, "#f6cf99");
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  // soft clouds lit from below
  for (let i = 0; i < 40; i++) {
    const x = r() * W;
    const y = H * (0.12 + r() * 0.42);
    const rw = 120 + r() * 380;
    const rh = 24 + r() * 60;
    const cg = g.createRadialGradient(x, y, 0, x, y, rw);
    cg.addColorStop(0, `rgba(${230 + r() * 25},${170 + r() * 40},${150 + r() * 40},${0.12 + r() * 0.18})`);
    cg.addColorStop(1, "rgba(230,170,150,0)");
    g.fillStyle = cg;
    g.save();
    g.translate(x, y);
    g.scale(1, rh / rw);
    g.translate(-x, -y);
    g.fillRect(x - rw, y - rw, rw * 2, rw * 2);
    g.restore();
  }
  // sun glow near horizon
  const sun = g.createRadialGradient(W * 0.62, H * 0.66, 0, W * 0.62, H * 0.66, 520);
  sun.addColorStop(0, "rgba(255,236,190,0.9)");
  sun.addColorStop(0.2, "rgba(255,200,140,0.45)");
  sun.addColorStop(1, "rgba(255,180,120,0)");
  g.fillStyle = sun;
  g.fillRect(0, 0, W, H);
  // hills + canopy layers, each a band of overlapping foliage blobs
  const layers = [
    { y: 0.64, spread: 50, size: [40, 90], col: [210, 18, 34] as const, n: 260 },
    { y: 0.72, spread: 70, size: [50, 120], col: [150, 22, 22] as const, n: 220 },
    { y: 0.82, spread: 90, size: [70, 150], col: [130, 28, 13] as const, n: 180 },
  ];
  for (const L of layers) {
    g.fillStyle = `hsl(${L.col[0]} ${L.col[1]}% ${L.col[2]}%)`;
    g.fillRect(0, H * L.y + 40, W, H);
    for (let i = 0; i < L.n; i++) {
      const x = r() * W;
      const y = H * L.y + (r() - 0.3) * L.spread;
      const rad = L.size[0] + r() * (L.size[1] - L.size[0]);
      g.fillStyle = `hsl(${L.col[0] + (r() - 0.5) * 16} ${L.col[1]}% ${L.col[2] + (r() - 0.5) * 5}%)`;
      g.beginPath();
      g.arc(x, y, rad, 0, Math.PI * 2);
      g.fill();
    }
  }
  const palm = (x: number, base: number, h: number, lean: number) => {
    g.strokeStyle = "#0b140f";
    g.lineWidth = 14;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(x, base);
    g.quadraticCurveTo(x + lean * 0.6, base - h * 0.55, x + lean, base - h);
    g.stroke();
    const tx = x + lean;
    const ty = base - h;
    g.lineWidth = 3;
    for (let k = 0; k < 12; k++) {
      const a = -Math.PI + (k / 11) * Math.PI * 1.1 + (r() - 0.5) * 0.2;
      const len = 220 + r() * 120;
      const ex = tx + Math.cos(a) * len;
      const ey = ty + Math.sin(a) * len * 0.45 + len * 0.35;
      g.beginPath();
      g.moveTo(tx, ty);
      g.quadraticCurveTo(tx + Math.cos(a) * len * 0.5, ty + Math.sin(a) * len * 0.3 - 40, ex, ey);
      g.stroke();
      // leaflets along the frond
      for (let q = 0.15; q < 1; q += 0.045) {
        const px = tx + (ex - tx) * q + Math.cos(a) * 0 ;
        const py = ty + (ey - ty) * q - Math.sin(q * Math.PI) * 40;
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(px + Math.cos(a + 1.3) * 60 * (1 - q * 0.6), py + 50 * (1 - q * 0.5));
        g.moveTo(px, py);
        g.lineTo(px + Math.cos(a - 1.3) * 60 * (1 - q * 0.6), py + 50 * (1 - q * 0.5));
        g.stroke();
      }
    }
  };
  palm(520, H, 900, 60);
  palm(2330, H, 1040, -80);
  palm(1780, H, 700, 40);
  palm(1180, H, 560, -30);
  for (let i = 0; i < 90; i++) {
    const x = r() * W;
    const y = H * (0.7 + r() * 0.28);
    const rad = 2 + r() * 8;
    const gl = g.createRadialGradient(x, y, 0, x, y, rad * 5);
    gl.addColorStop(0, "rgba(255,220,150,1)");
    gl.addColorStop(1, "rgba(255,180,90,0)");
    g.fillStyle = gl;
    g.fillRect(x - rad * 5, y - rad * 5, rad * 10, rad * 10);
  }
  return tex(c);
}

/** Lime plaster: very fine trowel mottling — reads "clean" but not CG-flat. */
export function plasterTexture() {
  const S = 1024;
  const r = rng(314);
  const [c, g] = canvas(S, S);
  const [b, gb] = canvas(S, S);
  g.fillStyle = "#ddd2c4";
  g.fillRect(0, 0, S, S);
  gb.fillStyle = "#808080";
  gb.fillRect(0, 0, S, S);
  for (let i = 0; i < 1800; i++) {
    const x = r() * S;
    const y = r() * S;
    const rad = 20 + r() * 90;
    const l = r() < 0.5 ? 255 : 0;
    const a = 0.012 + r() * 0.025;
    const cg = g.createRadialGradient(x, y, 0, x, y, rad);
    cg.addColorStop(0, `rgba(${l},${l - (l ? 12 : 0)},${l - (l ? 28 : 0)},${a})`);
    cg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = cg;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    const bg = gb.createRadialGradient(x, y, 0, x, y, rad);
    bg.addColorStop(0, `rgba(${l},${l},${l},${a * 3})`);
    bg.addColorStop(1, "rgba(128,128,128,0)");
    gb.fillStyle = bg;
    gb.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  return { map: tex(c, true, [2, 1]), bump: tex(b, false, [2, 1]) };
}

/** Travertine: warm stone with horizontal veining and pores. */
export function travertineTexture() {
  const S = 512;
  const r = rng(808);
  const [c, g] = canvas(S, S);
  g.fillStyle = "#d8ccb7";
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 90; i++) {
    const y = r() * S;
    g.strokeStyle = `rgba(${150 + r() * 40},${130 + r() * 30},${100 + r() * 30},${0.08 + r() * 0.12})`;
    g.lineWidth = 1 + r() * 5;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= S; x += 32) g.lineTo(x, y + Math.sin(x * 0.02 + i) * 4);
    g.stroke();
  }
  for (let i = 0; i < 500; i++) {
    g.fillStyle = `rgba(120,100,75,${0.15 + r() * 0.25})`;
    g.beginPath();
    g.ellipse(r() * S, r() * S, 1 + r() * 3, 0.6 + r(), 0, 0, Math.PI * 2);
    g.fill();
  }
  return tex(c);
}
