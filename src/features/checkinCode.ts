/**
 * รหัสเช็กอินของคลินิก (แยกจาก QR ชำระเงิน) — แสดงเป็น QR ที่เคาน์เตอร์ (หน้า "QR เช็กอิน")
 * เปลี่ยนรหัสใหม่ทุก 30 วินาที (ถ่ายรูปส่งต่อ/ใช้ทีหลังไม่ได้) · คำนวณจากรหัสลับของคลินิก (settings.checkinSecret) + ช่วงเวลา
 * ผู้ป่วยสแกนด้วยแอป ThaiWell AI → แอปส่งรหัสมากับการเช็กอิน → คลินิกตรวจรหัสแล้วออกเลขคิวตามลำดับคนมาเช็กอิน
 */
export const CHECKIN_WINDOW_MS = 30_000;
/** รหัสยังใช้ได้ย้อนหลังกี่ช่วง (สแกนแล้วกดส่งช้า / เน็ตช้า) */
const GRACE = 4;
export const checkinWindow = (t = Date.now()) => Math.floor(t / CHECKIN_WINDOW_MS);
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // ไม่มี 0/O 1/I ให้พิมพ์เองได้ไม่สับสน

function cyrb53(str: string, seed = 0) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** รหัส 6 ตัวของช่วงเวลานั้น */
export function checkinCode(secret: string, window: number) {
  let n = cyrb53(`${secret}|${window}`);
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += ALPHABET[n % ALPHABET.length];
    n = Math.floor(n / ALPHABET.length);
  }
  return out;
}
/** รหัสที่ผู้ป่วยส่งมาตรงกับช่วงปัจจุบันหรือไม่กี่ช่วงก่อนหน้า */
export function validCheckinCode(secret: string, code: string, t = Date.now()) {
  const w = checkinWindow(t);
  for (let i = 0; i <= GRACE; i++) if (checkinCode(secret, w - i) === code) return true;
  return false;
}
/** ข้อความใน QR — แอปรู้จักจากคำขึ้นต้น */
export const checkinQrText = (code: string) => `THAIWELL-CHECKIN:${code}`;
export const newCheckinSecret = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
