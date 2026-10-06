/**
 * โหมดการทำงาน
 *   ใช้งานจริง (ค่าเริ่มต้น): เข้าสู่ระบบด้วยบัญชีคลินิก · ข้อมูลทั้งหมดอยู่ในฐานข้อมูล (Supabase bo_store) ไม่มีข้อมูลจำลอง
 *   สาธิต/ทดสอบ: localStorage "thaiwell.demo" = "1" (หรือ ?demo=1) → ข้อมูลจำลองในเครื่องแบบเดิม — ใช้กับชุด QA และวิดีโอคู่มือ
 */
const flag = () => {
  try {
    if (new URLSearchParams(window.location.search).get("demo") === "1") localStorage.setItem("thaiwell.demo", "1");
    return localStorage.getItem("thaiwell.demo") === "1";
  } catch {
    return false;
  }
};
export const DEMO = flag();
export const LIVE = !DEMO;
