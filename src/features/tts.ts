/** Queue announcements with the BMS VoxCPM Thai TTS (OpenAI-compatible /v1/audio/speech, CORS open).
 *  Falls back to the device voice (speechSynthesis) if the server is slow or unreachable. */
const API = "https://vox-cpm.bmscloud.in.th/v1/audio/speech";

export const CALL_VOICES = [
  { id: "female_sofia", label: "Sofia", gender: "หญิง" },
  { id: "female_niki", label: "Niki", gender: "หญิง" },
  { id: "female_alma", label: "Alma", gender: "หญิง" },
  { id: "female_martha", label: "Martha", gender: "หญิง" },
  { id: "female", label: "เสียงหญิงมาตรฐาน", gender: "หญิง" },
  { id: "male_eugene", label: "Eugene", gender: "ชาย" },
  { id: "male_kostas", label: "Kostas", gender: "ชาย" },
  { id: "male_takis", label: "Takis", gender: "ชาย" },
  { id: "male_boga", label: "Boga", gender: "ชาย" },
  { id: "male", label: "เสียงชายมาตรฐาน", gender: "ชาย" },
] as const;
export const DEFAULT_CALL_VOICE = "female_sofia";

const DIGITS = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const LETTERS: Record<string, string> = { A: "เอ", B: "บี", C: "ซี", D: "ดี", E: "อี", F: "เอฟ", H: "เอช", K: "เค", M: "เอ็ม", N: "เอ็น", P: "พี", S: "เอส", T: "ที", V: "วี", W: "ดับเบิลยู" };
/** "A011" → "เอ ศูนย์ หนึ่ง หนึ่ง" (read digit by digit, like a hospital queue) */
export const spellQueue = (q: string) =>
  q
    .toUpperCase()
    .split("")
    .map((c) => (/\d/.test(c) ? DIGITS[+c] : LETTERS[c] ?? c))
    .join(" ");

// one shared <audio>: iPad Safari only lets an element play after it was started inside a tap,
// so we "unlock" it synchronously in the click handler and reuse it once the audio arrives
let player: HTMLAudioElement | null = null;
const SILENT = "data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRBqpAAAAAAAAAAAAAAAAAAAA//sQZAAP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAETEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV";
let ctx: AudioContext | null = null;

function unlock() {
  player ??= new Audio();
  player.src = SILENT;
  player.play().catch(() => {});
  try {
    ctx ??= new AudioContext();
    void ctx.resume();
  } catch {
    /* no web audio */
  }
}

/** soft two-tone chime before the announcement */
function chime(): Promise<void> {
  return new Promise((res) => {
    if (!ctx) return res();
    const t = ctx.currentTime + 0.02;
    for (const [i, f] of [783.99, 1046.5].entries()) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0, t + i * 0.32);
      g.gain.linearRampToValueAtTime(0.22, t + i * 0.32 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.32 + 0.9);
      o.connect(g).connect(ctx.destination);
      o.start(t + i * 0.32);
      o.stop(t + i * 0.32 + 1);
    }
    setTimeout(res, 900);
  });
}

const cache = new Map<string, string>(); // voice|text → blob url

async function fetchSpeech(text: string, voice: string, timeoutMs = 7000): Promise<string> {
  const key = `${voice}|${text}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "voxcpm-thai", input: text, voice, response_format: "mp3", speed: 0.95 }),
      signal: ac.signal,
    });
    if (!r.ok) throw new Error(`TTS ${r.status}`);
    const url = URL.createObjectURL(await r.blob());
    cache.set(key, url);
    return url;
  } finally {
    clearTimeout(timer);
  }
}

function deviceVoice(text: string) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "th-TH";
    u.rate = 0.95;
    window.speechSynthesis?.cancel();
    window.speechSynthesis?.speak(u);
  } catch {
    /* no speech on this device */
  }
}

/** Speak `text` (call this from a tap/click). Resolves when playback starts. Returns "vox" or "device". */
export async function announce(text: string, voice = DEFAULT_CALL_VOICE, opts: { chime?: boolean } = {}): Promise<"vox" | "device"> {
  unlock();
  const audio = fetchSpeech(text, voice);
  if (opts.chime !== false) await chime();
  try {
    const url = await audio;
    player!.pause();
    player!.src = url;
    await player!.play();
    return "vox";
  } catch {
    deviceVoice(text);
    return "device";
  }
}

/** queue call sentence */
export const callText = (queueNo: string, name: string, room?: string) =>
  `ขอเชิญหมายเลข ${spellQueue(queueNo)} คุณ${name.replace(/^(นางสาว|นาง|นาย)\s*/, "")}${room ? ` ที่${room}` : ""} ค่ะ`;
