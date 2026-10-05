# ThaiWell · Back-office

ระบบบริหารหลังบ้านคลินิกแพทย์แผนไทย (React + Vite + TypeScript) — ออกแบบตาม Figma
`ThaiWell › Frame 2 (47:143)` และ workflow จาก รพ.หาดใหญ่

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
```

## หน้าจอ

| Route | หน้า | สิ่งที่ทำได้ |
|---|---|---|
| `/` | Dashboard (ตาม Figma) | KPI วันนี้ · กดตัวเลขสถานะเพื่อกรองรายการ · การ์ดคำขอจองคิวแบบซ้อน (กด ⌄ เพื่อกางทั้งหมด) · อนุมัติ/ปฏิเสธพร้อมผลคัดกรองและเครดิต · รายการงานวันนี้ → เริ่ม/เสร็จสิ้น/ไม่มา |
| `/appointments` | ตารางนัด | มุมมองวัน (แยกตามผู้บำบัด) · สัปดาห์ (ความหนาแน่นต่อรอบ) · เดือน |
| `/planner` | จัดตารางงาน | เลือกผู้ป่วย → แตะวันในปฏิทิน · ตรวจเครดิตคงเหลือ วันปิด เตียงเต็ม ระยะห่างขั้นต่ำ · แนะนำวันอัตโนมัติ |
| `/patients` | ผู้มารับบริการ | ตาราง ค้นหา กรอง เรียงลำดับ · แนวโน้ม Pain Score · เพิ่มผู้รับบริการ |
| `/settings` | ตั้งค่า | เวลาทำการ เตียงต่อรอบ กฎคัดกรอง การแจ้งเตือน (บันทึกอัตโนมัติ) · รีเซ็ตข้อมูลตัวอย่าง |
| `/design-system` | Design System | tokens, typography, components, motion แบบ live |

## Design system

```
src/design-system/
  tokens.css       primitive → semantic → component tokens (สี, ตัวอักษร, spacing, radius, เงา, glass, motion)
  base.css         reset + scroll/focus/reduced-motion
  components.css   คลาส tw-* ทั้งหมดอ่านจาก token เท่านั้น
  motion.ts        spring.snappy / soft / gentle + variants กลาง
  components/      Card, Button, IconButton, Badge, Avatar, Icon (mask tint), SearchField,
                   Segmented, Switch, Chip, Field/Input/Select/Textarea, Dialog, Drawer, Toast,
                   AnimatedNumber, EmptyState
```

- ตัวอักษร: **Inter** (ละติน/ตัวเลข) + **Sarabun** (ไทยมีหัว) ผ่าน font stack เดียว
- สีสถานะใช้ความหมายเดียวทั้งระบบ: เขียว = รับบริการแล้ว · เหลือง = รอ · ฟ้า = กำลังรับบริการ · แดง = ไม่มา
- ไอคอนจาก Figma ใช้ไฟล์ SVG เดิมเป็น mask เพื่อเปลี่ยนสีได้โดยไม่แก้ asset

## ข้อมูล

ข้อมูลเป็นชุดสมมติ (deterministic seed) อิงวันที่ปัจจุบัน เก็บใน `localStorage` ของเบราว์เซอร์
กฎคัดกรองความปลอดภัยอยู่ที่ `src/data/domain.ts` (rule-based, ตรวจสอบย้อนกลับได้ ไม่ใช้ AI ตัดสิน)
