export const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

export const MAX_LIGHTS = 8;

export const FRAG = `
precision highp float;
uniform sampler2D uImg;
uniform sampler2D uDepth;
uniform vec2 uRes;       // canvas size, css px
uniform float uDpr;
uniform vec4 uRect;      // photo placement on screen: x, y, w, h (css px)
uniform float uZoom;
uniform float uTime;
uniform vec2 uPar;       // parallax, -1..1
uniform float uFocus;    // depth kept sharp
uniform float uDof;      // max depth-of-field blur, css px
uniform float uHaze;     // uniform blur (work pages), css px
uniform float uDim;      // veil
uniform float uMotion;   // 0 = reduced motion
uniform vec4 uFlames[${8}];
uniform vec4 uGlows[${8}];
uniform vec4 uSmoke[3];
uniform float uFlameN;
uniform float uGlowN;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}

void main() {
  float t = uTime;
  vec2 px = vec2(gl_FragCoord.x, uRes.y * uDpr - gl_FragCoord.y) / uDpr;
  vec2 c = uRes * 0.5;
  px = c + (px - c) / uZoom;
  vec2 uv = (px - uRect.xy) / uRect.zw;

  // ── parallax: near surfaces travel further (2-step depth refinement)
  vec2 par = uPar * vec2(0.016, 0.011);
  float d = texture2D(uDepth, uv).r;
  vec2 uv2 = uv + par * (d - 0.3);
  d = texture2D(uDepth, uv2).r;
  uv2 = uv + par * (d - 0.3);
  d = texture2D(uDepth, uv2).r;

  // ── depth of field (golden-angle disc; bright samples bloom into bokeh)
  float coc = clamp(abs(d - uFocus) * 1.35, 0.0, 1.0);
  coc = coc * coc * (3.0 - 2.0 * coc);
  float radius = coc * uDof + uHaze;
  vec3 col;
  if (radius < 0.6) {
    col = texture2D(uImg, uv2).rgb;
  } else {
    vec2 texel = 1.0 / uRect.zw;
    vec3 acc = vec3(0.0);
    float wsum = 0.0;
    for (int i = 0; i < 24; i++) {
      float fi = float(i);
      float r = sqrt((fi + 0.5) / 24.0) * radius;
      float a = fi * 2.39996323;
      vec3 s = texture2D(uImg, uv2 + vec2(cos(a), sin(a)) * r * texel).rgb;
      float l = dot(s, vec3(0.3, 0.59, 0.11));
      float w = 1.0 + pow(l, 5.0) * 7.0 * coc;
      acc += s * w;
      wsum += w;
    }
    col = acc / wsum;
  }

  vec2 ip = uv2 * uRect.zw;          // point in image space, css px
  float W = uRect.z;
  vec3 warm = vec3(1.0, 0.6, 0.26);
  float flickSum = 0.0;

  // ── candle flames: fast flicker, spill light onto nearby surfaces
  for (int i = 0; i < ${8}; i++) {
    if (float(i) >= uFlameN) break;
    vec4 f = uFlames[i];
    float seed = f.w;
    float fl = 0.72 + 0.28 * noise(vec2(t * 7.3 * uMotion + seed * 17.0, seed))
             + 0.1 * sin(t * 21.0 * uMotion + seed * 5.0) * noise(vec2(t * 2.7 * uMotion, seed * 3.0));
    flickSum += fl;
    vec2 q = ip - f.xy * uRect.zw;
    q.y *= 0.75;
    float dist = length(q);
    float core = exp(-dist / (f.z * W * 0.22));
    float spill = exp(-dist / (f.z * W * 3.2));
    col += warm * fl * (0.5 * core + 0.085 * spill) * (1.0 - coc * 0.4);
  }
  // ── sconces & niche lights: slow breathing
  for (int i = 0; i < ${8}; i++) {
    if (float(i) >= uGlowN) break;
    vec4 g = uGlows[i];
    float br = 0.86 + 0.14 * sin(t * 0.8 * uMotion + g.w * 6.0) + 0.05 * noise(vec2(t * 2.0 * uMotion, g.w * 9.0));
    float dist = length(ip - g.xy * uRect.zw);
    col += warm * br * 0.11 * exp(-dist / (g.z * W));
  }

  // ── aroma smoke curling up from the candles
  float scale = W / 2000.0;
  for (int i = 0; i < 3; i++) {
    vec4 s = uSmoke[i];
    vec2 q = ip - s.xy * uRect.zw;
    float h = -q.y / scale;                  // height above the wick, normalised px
    if (h > 0.0 && h < 260.0) {
      float hn = h / 260.0;
      float sway = (fbm(vec2(h * 0.011 - t * 0.28 * uMotion, s.w * 7.0 + t * 0.07 * uMotion)) - 0.5) * 110.0 * hn;
      float x = q.x / scale - sway;
      float width = mix(2.0, 38.0, hn * hn);
      float n = fbm(vec2(x * 0.045, h * 0.024 - t * 0.85 * uMotion) + s.w * 3.0);
      float dens = exp(-abs(x) / width) * smoothstep(0.0, 0.06, hn) * (1.0 - hn) * smoothstep(0.32, 0.78, n);
      col = mix(col, vec3(0.95, 0.9, 0.84), clamp(dens * 0.62 * s.z, 0.0, 1.0));
    }
  }

  // ── dust motes: soft out-of-focus specks close to the lens (near layer → strongest parallax)
  vec2 mp = (px + uPar * vec2(-70.0, -46.0)) / 150.0;
  mp += vec2(sin(t * 0.05) * 0.5, -t * 0.03) * uMotion;
  vec2 cell = floor(mp);
  vec2 fr = fract(mp);
  float hc = hash(cell);
  vec2 pos = 0.25 + 0.5 * vec2(hash(cell + 3.1), hash(cell + 7.7))
           + 0.1 * vec2(sin(t * 0.35 * uMotion + hc * 20.0), cos(t * 0.3 * uMotion + hc * 13.0));
  float size = 0.05 + 0.07 * hash(cell + 1.3);
  float twinkle = 0.55 + 0.45 * sin(t * (0.6 + hc) * uMotion + hc * 30.0);
  float md = length(fr - pos);
  float mote = (smoothstep(size, size * 0.55, md) * 0.55 + smoothstep(size * 0.45, 0.0, md) * 0.25) * step(0.8, hc) * twinkle;
  float lit = dot(col, vec3(0.3, 0.59, 0.11));
  col += vec3(1.0, 0.84, 0.6) * mote * (0.05 + lit * 0.32);

  // whole-room warmth follows the flames a little
  col *= 0.975 + 0.035 * (flickSum / max(uFlameN, 1.0) - 0.86);

  // vignette, veil
  vec2 vu = gl_FragCoord.xy / (uRes * uDpr) - 0.5;
  col *= 1.0 - dot(vu, vu) * 0.42;
  col = mix(col, vec3(0.094, 0.071, 0.047), uDim);
  gl_FragColor = vec4(col, 1.0);
}
`;
