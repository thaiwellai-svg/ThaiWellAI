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

/** Thai speech → text (OpenAI-compatible transcription endpoint). */
export async function transcribe(audio: Blob, filename = "voice.webm"): Promise<string> {
  const fd = new FormData();
  fd.append("file", audio, filename);
  fd.append("model", ASR.model);
  fd.append("language", "th");
  const res = await fetch(ASR.url, { method: "POST", body: fd });
  if (!res.ok) throw new Error(`ASR ${res.status}`);
  const data = await res.json();
  return String(data.text ?? "").trim();
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
