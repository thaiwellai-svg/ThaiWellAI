/** BMS cloud AI endpoints (CORS-open, called straight from the iPad). */
export const AI = {
  chat: "https://vllm-gemma.bmscloud.in.th/v1/chat/completions",
  model: "gemma4",
  ocr: "https://pdf-ocr-mcp.bmscloud.in.th",
};

/** Knowledge the planner must follow — from the clinic's Thai-massage reference sheet. */
export const THAI_MASSAGE_KNOWLEDGE = `
ความรู้หลักนวดไทย (ใช้เป็นกรอบการวางแผน):
- นวดไทยเป็นการบำบัดรักษาด้วยกรรมวิธีแพทย์แผนไทย ครอบคลุมการตรวจ วินิจฉัย รักษา และฟื้นฟูสุขภาพ ด้วยการกด คลึง บีบ ดัด ดึง
- ทฤษฎีธาตุเจ้าเรือนและเส้นประธานสิบ: ปรับสมดุลธาตุ ดิน น้ำ ลม ไฟ และทางเดินพลังงานหลัก 10 เส้น (อิทา ปิงคลา สุมนา กาลทารี สหัสรังสี ทวารี จันทภูสัง รุชำ สิขิณี สุขุมัง)
- เทคนิคร่วม: ประคบสมุนไพร อบสมุนไพร กายบริหารฤาษีดัดตน
- นวดแบบราชสำนัก (ใช้มือและนิ้ว สุภาพ ไม่ใช้ศอก/เข่า) vs เชลยศักดิ์ (ใช้ศอก เข่า ร่วมด้วย)
- ขอบเขตกฎหมาย: "นวดเพื่อสุขภาพ/สปา" (ผ่อนคลายกล้ามเนื้อ, พ.ร.บ.สถานประกอบการเพื่อสุขภาพ 2559) แยกจาก "นวดไทยเพื่อการรักษา" (บำบัดโรค/ฟื้นฟูเฉพาะอาการ, พ.ร.บ.วิชาชีพการแพทย์แผนไทย 2556 ต้องทำโดยผู้มีใบประกอบวิชาชีพ)
- เป็นบริการในสถานพยาบาลที่เบิกจ่ายได้ และช่วยลดการใช้ยาแก้ปวดกลุ่ม NSAIDs
- ข้อห้ามนวด: ไข้, โรคติดต่อระยะแพร่กระจาย, ความดันตัวบนสูงเกินเกณฑ์, ผ่าตัดไม่เกิน 30 วัน, ตั้งครรภ์ (ต้องแพทย์ประเมิน), กระดูกหัก/อักเสบเฉียบพลัน; มีประจำเดือนให้ระวังการกดท้อง/ประคบร้อน
- ธาตุ: ดิน ปวดเมื่อยกล้ามเนื้อ ข้อติด · น้ำ บวม เสมหะ ไม่ชอบเย็น · ลม ปวดตามเส้น ชา เครียด นอนยาก · ไฟ อักเสบ ร้อนใน ความดันสูง (เลี่ยงความร้อนจัด)
`.trim();

export async function chatJSON<T>(system: string, user: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(AI.chat, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      model: AI.model,
      temperature: 0.3,
      max_tokens: 2200,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`AI ${res.status}`);
  const data = await res.json();
  const text: string = data.choices?.[0]?.message?.content ?? "";
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(json) as T;
}

/** OCR a referral letter / lab report (PDF or photo) into text. */
export async function ocrFile(file: File, signal?: AbortSignal): Promise<string> {
  const pdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const fd = new FormData();
  fd.append("file", file);
  if (pdf) {
    fd.append("fmt", "text");
    fd.append("analyze_layout", "false");
  }
  const res = await fetch(`${AI.ocr}/${pdf ? "pdf_extract" : "ocr_image"}/upload`, { method: "POST", body: fd, signal });
  if (!res.ok) throw new Error(`OCR ${res.status}`);
  const data = await res.json();
  return (data.text ?? "").trim();
}

export const ASR = { url: "https://asr2.bmscloud.in.th/v1/audio/transcriptions", model: "Qwen/Qwen3-ASR-1.7B" };

/** Float PCM (any rate, mono) → 16 kHz mono 16-bit WAV — the format the ASR server reads. */
export async function pcmToWav16k(pcm: Float32Array, rate: number): Promise<Blob> {
  const out = 16000;
  let data = pcm;
  if (rate !== out) {
    const off = new OfflineAudioContext(1, Math.max(1, Math.ceil((pcm.length * out) / rate)), out);
    const b = off.createBuffer(1, pcm.length, rate);
    b.copyToChannel(pcm as Float32Array<ArrayBuffer>, 0);
    const node = off.createBufferSource();
    node.buffer = b;
    node.connect(off.destination);
    node.start();
    data = (await off.startRendering()).getChannelData(0);
  }
  const buf = new ArrayBuffer(44 + data.length * 2);
  const v = new DataView(buf);
  const str = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + data.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, out, true);
  v.setUint32(28, out * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, data.length * 2, true);
  for (let i = 0; i < data.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, data[i])) * 0x7fff, true);
  return new Blob([buf], { type: "audio/wav" });
}

/**
 * Microphone → raw PCM straight from Web Audio (no MediaRecorder / codec round-trip, so the sample rate is exact).
 * Works on iPad Safari and desktop browsers in a secure context (https or localhost).
 */
export async function startMic(onLevel?: (v: number) => void) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  await ctx.resume().catch(() => {});
  const src = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  proc.onaudioprocess = (e) => {
    const d = e.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(d));
    if (onLevel) {
      // loudness (RMS) mapped so normal speech fills most of the range
      let sum = 0;
      for (let i = 0; i < d.length; i += 8) sum += d[i] * d[i];
      const rms = Math.sqrt(sum / (d.length / 8));
      onLevel(Math.min(1, Math.pow(rms * 9, 0.7)));
    }
  };
  // a muted sink keeps the processor running without echoing the mic to the speaker
  const mute = ctx.createGain();
  mute.gain.value = 0;
  src.connect(proc);
  proc.connect(mute);
  mute.connect(ctx.destination);
  const close = () => {
    proc.disconnect();
    src.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    ctx.close().catch(() => {});
  };
  return {
    /** stop and return a 16 kHz WAV plus the recorded length in seconds */
    async stop() {
      const rate = ctx.sampleRate;
      close();
      const n = chunks.reduce((a, c) => a + c.length, 0);
      const pcm = new Float32Array(n);
      let o = 0;
      for (const c of chunks) {
        pcm.set(c, o);
        o += c.length;
      }
      return { wav: await pcmToWav16k(pcm, rate), seconds: n / rate };
    },
    cancel: close,
  };
}
export type Mic = Awaited<ReturnType<typeof startMic>>;

/** An audio file (e.g. an iPad Voice Memo .m4a) → 16 kHz WAV for the ASR server. */
export async function fileToWav(file: Blob): Promise<{ wav: Blob; seconds: number }> {
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  try {
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    // mix down to mono
    const pcm = new Float32Array(buf.length);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i++) pcm[i] += d[i] / buf.numberOfChannels;
    }
    return { wav: await pcmToWav16k(pcm, buf.sampleRate), seconds: buf.duration };
  } finally {
    ctx.close().catch(() => {});
  }
}

/** Thai speech → text (OpenAI-compatible transcription endpoint). Send a WAV (see startMic). */
export async function transcribe(wav: Blob): Promise<string> {
  const fd = new FormData();
  fd.append("file", wav, "voice.wav");
  fd.append("model", ASR.model);
  fd.append("language", "th");
  const res = await fetch(ASR.url, { method: "POST", body: fd });
  if (!res.ok) throw new Error(`ASR ${res.status}`);
  const data = await res.json();
  // the model prefixes its output with "language Thai<asr_text>"
  return String(data.text ?? "")
    .replace(/^.*<asr_text>/s, "")
    .trim();
}

export interface ChatMsg {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Stream a chat completion; calls onDelta with each text chunk. */
export async function chatStream(messages: ChatMsg[], onDelta: (t: string) => void, signal?: AbortSignal) {
  const res = await fetch(AI.chat, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({ model: AI.model, temperature: 0.4, max_tokens: 1400, stream: true, messages }),
  });
  if (!res.ok || !res.body) throw new Error(`AI ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const l = line.trim();
      if (!l.startsWith("data:")) continue;
      const payload = l.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const t = JSON.parse(payload).choices?.[0]?.delta?.content;
        if (t) onDelta(t);
      } catch {
        /* partial line */
      }
    }
  }
}
