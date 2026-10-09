// End-to-end study cases for ThaiWell back-office (WebKit, iPad landscape)
const { webkit } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const B = process.env.BASE_URL || 'http://localhost:5188';
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const KEY = 'thaiwell.backoffice';

const ROLES = {
  reception: { staffName: 'คุณมาลี ต้อนรับดี', staffRole: 'เจ้าหน้าที่เวชระเบียน / ต้อนรับ' },
  therapist: { staffName: 'พท.ป. วิภาวดี ศรีสุข', staffRole: 'แพทย์แผนไทย / ผู้บำบัด' },
  cashier: { staffName: 'คุณสมใจ การเงิน', staffRole: 'แคชเชียร์' },
  doctor: { staffName: 'นศ.พท. สมชาย', staffRole: 'แพทย์แผนไทยประยุกต์' },
  admin: { staffName: 'คุณสมศักดิ์ รักดี', staffRole: 'ผู้ดูแลระบบ' },
};

const results = [];
let only = process.argv.slice(2);

async function newPage(b, role) {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 1024 } });
  // โหมดสาธิต/ทดสอบ: ข้อมูลจำลองในเครื่อง ไม่แตะฐานข้อมูลจริง
  await ctx.addInitScript(() => { try { localStorage.setItem('thaiwell.tour.v2', '1'); localStorage.setItem('thaiwell.demo', '1'); } catch {} });
  const p = await ctx.newPage();
  p.errs = [];
  p.on('pageerror', (e) => p.errs.push(e.message));
  p.setDefaultTimeout(8000);
  await p.goto(B + '/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  if (role) await setRole(p, role);
  return { ctx, p };
}
async function setRole(p, role) {
  await p.evaluate(([k, r]) => { const s = JSON.parse(localStorage.getItem(k)); s.settings = { ...s.settings, ...r }; s.keepData = true; localStorage.setItem(k, JSON.stringify(s)); }, [KEY, ROLES[role]]);
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(600);
}
const state = (p) => p.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
const mutate = async (p, fn, arg) => {
  await p.evaluate(([k, src, a]) => { const s = JSON.parse(localStorage.getItem(k)); new Function('s', '__arg', src)(s, a); s.keepData = true; localStorage.setItem(k, JSON.stringify(s)); }, [KEY, fn, arg]);
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(700);
};
const go = async (p, url, ms = 1300) => { await p.goto(B + url, { waitUntil: 'networkidle' }); await p.waitForTimeout(ms); };
const today = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

async function check(id, role, who, title, fn) {
  if (only.length && !only.some((o) => id.startsWith(o))) return;
  const b = check.browser;
  const { ctx, p } = await newPage(b, role);
  const notes = [];
  let pass = true;
  const expect = (cond, msg) => { if (!cond) { pass = false; notes.push('✗ ' + msg); } else notes.push('✓ ' + msg); };
  try {
    await fn(p, expect, notes);
  } catch (e) {
    pass = false;
    notes.push('ERROR ' + e.message.split('\n')[0]);
  }
  if (p.errs.length) { pass = false; notes.push('pageerror: ' + p.errs.join(' | ')); }
  if (!pass) await p.screenshot({ path: path.join(OUT, id + '.png') }).catch(() => {});
  results.push({ id, role, who, title, pass, notes });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id} [${role}] ${title}`);
  if (!pass) notes.filter((n) => !n.startsWith('✓')).forEach((n) => console.log('     ' + n));
  await ctx.close();
}

// ---------- shared flows ----------
async function registerViaCard(p) {
  await go(p, '/patients/new', 900);
  await p.click('.ap-card'); await p.waitForTimeout(1300);
  await p.click('.crd__btn.is-primary'); await p.waitForTimeout(2600);
}

// ผู้ป่วยที่มีคอร์สและนัดล่วงหน้ามากที่สุด (ไม่ใช่ผู้ใช้แอปตัวอย่าง — นัดของเขาอยู่ใน cloud)
async function coursePatient(p) {
  const s = await state(p);
  // นัดของคอร์ส = บริการเดียวกับคอร์ส ตั้งแต่วันเริ่มคอร์ส (ตัวนับกลาง)
  const n = (pt) => s.appointments.filter((a) => a.patientId === pt.id && a.serviceId === pt.course.serviceId && a.date >= pt.course.startedOn && a.status === 'waiting' && !a.calledAt && a.date > today()).length;
  return s.patients.filter((pt) => pt.course && !pt.cloudId).sort((a, b) => n(b) - n(a))[0].name;
}
/** นัดตามคอร์ส 3 นัดล่วงหน้า (บริการของคอร์ส · ตัวนับกลางนับเฉพาะนัดของคอร์ส) */
async function addCourseVisits(p, who) {
  await mutate(p, `const pt = s.patients.find((x) => x.name === __arg.who); const t0 = s.appointments.find((a) => a.patientId === pt.id) || s.appointments[0];
    const d = (n) => new Date(Date.now() + 7 * 3600e3 + n * 864e5).toISOString().slice(0, 10);
    pt.course.total = Math.max(pt.course.total, pt.course.used + 4);
    [3, 5, 7].forEach((n) => s.appointments.push({ id: 'qa-cv' + n, patientId: pt.id, serviceId: pt.course.serviceId, therapistId: t0.therapistId, date: d(n), start: '10:00', status: 'waiting', type: 'booked', painBefore: 5, paid: false, log: [] }));`, { who });
}
async function next(p, ms = 1800) { await p.getByRole('button', { name: 'ถัดไป' }).click(); await p.waitForTimeout(ms); }
async function answer(p, idx, yes) { await p.locator('.ap-qn__row').nth(idx).locator('.ap-qn__opt').nth(yes ? 1 : 0).click(); }
async function openVisit(p, apptId) { await go(p, '/visits?id=' + apptId, 1500); }

(async () => {
  const b = await webkit.launch();
  check.browser = b;

  // ===== RECEPTION =====
  await check('R01', 'reception', 'ผู้ป่วยใหม่ · มีบัตรประชาชน · สุขภาพดี', 'ลงทะเบียนด้วยบัตร + คัดกรองผ่าน + บันทึก', async (p, ex) => {
    await registerViaCard(p);
    const name = await p.locator('.ap-grid input').nth(1).inputValue();
    ex(name.length > 0, 'กรอกชื่อจากบัตรอัตโนมัติ');
    await p.fill('input[placeholder="081-234-5678"]', '0812345678');
    await next(p, 2500);
    const st = await p.locator('.ap-body .b3__stage').boundingBox();
    await p.mouse.click(st.x + st.width * 0.5, st.y + st.height * 0.3); await p.waitForTimeout(300);
    await p.locator('.ap-pain button').nth(4).click();
    await p.fill('input[aria-label="ความดันตัวบน"]', '118'); await p.fill('input[aria-label="ความดันตัวล่าง"]', '76'); await p.fill('input[aria-label="ชีพจร"]', '70');
    await next(p, 2200);
    ex((await p.locator('.sm-verdict.is-ok').count()) === 1, 'หน้าสรุปขึ้น "ผ่านการคัดกรอง"');
    ex((await p.locator('.sm-el').count()) === 1, 'มีการวิเคราะห์ธาตุเจ้าเรือน');
    await p.getByRole('button', { name: 'บันทึก' }).click(); await p.waitForTimeout(1500);
    const s = await state(p);
    const pt = s.patients.find((x) => x.name.includes(name));
    ex(!!pt, 'บันทึกผู้ป่วยลงระบบ');
    ex(pt && pt.screening && pt.screening.pain === 4, 'บันทึกผลคัดกรอง + pain 4');
    ex(pt && pt.painHistory.some((x) => x.score === 4), 'pain เข้ากราฟ Pain Score');
    ex(s.audit.some((a) => a.by === ROLES.reception.staffName && /ลงทะเบียน|เพิ่มผู้/.test(a.text)), 'ประวัติการแก้ไขบันทึกชื่อเจ้าหน้าที่ต้อนรับ');
  });

  await check('R02', 'reception', 'ผู้ป่วยใหม่ · ไม่มีบัตร · ไม่มีเบอร์โทร', 'กรอกเอง + ข้ามการคัดกรอง', async (p, ex) => {
    await go(p, '/patients/new', 900);
    await p.fill('.ap-cid', '1234567890121');
    await p.locator('.ap-grid input').nth(1).fill('ทดสอบ'); await p.locator('.ap-grid input').nth(2).fill('ไม่มีเบอร์');
    await p.click('.bdc__field'); await p.waitForTimeout(400);
    await p.locator('.bdc__pop select').nth(1).selectOption({ index: 35 }); await p.locator('.bdc__pop button:has-text("12")').first().click(); await p.waitForTimeout(300);
    ex(await p.getByRole('button', { name: 'ถัดไป' }).isEnabled(), 'ไม่กรอกเบอร์ก็ไปต่อได้');
    await next(p, 1500);
    await p.getByRole('button', { name: 'ข้ามการคัดกรอง' }).click(); await p.waitForTimeout(500);
    ex((await p.locator('.sm-verdict.is-skip').count()) === 1, 'สรุปบอกว่ายังไม่ได้คัดกรอง');
    await p.getByRole('button', { name: 'บันทึก' }).click(); await p.waitForTimeout(1500);
    ex((await p.locator('.pd__ib[aria-label="ข้อมูลสุขภาพ"]').count()) === 1, 'เปิดหน้าผู้ป่วยใหม่');
    await p.click('.pd__icons button[aria-label="เพิ่มเติม"]'); await p.waitForTimeout(300);
    ex((await p.locator('.more button', { hasText: 'โทร' }).count()) === 0, 'ไม่มีเมนูโทรเมื่อไม่มีเบอร์');
  });

  await check('R03', 'reception', 'ผู้ป่วยเดิมมาลงทะเบียนซ้ำ', 'กันเลขบัตรซ้ำ', async (p, ex) => {
    await mutate(p, "s.patients[0].citizenId='1101700203450'");
    await go(p, '/patients/new', 900);
    await p.fill('.ap-cid', '1101700203450'); await p.waitForTimeout(300);
    ex((await p.locator('.ap-dup').count()) === 1, 'แสดงเตือนเลขบัตรซ้ำ');
    ex(await p.getByRole('button', { name: 'ถัดไป' }).isDisabled(), 'กดถัดไปไม่ได้');
    await p.click('.ap-dup button'); await p.waitForTimeout(1300);
    ex(p.url().endsWith('/patients'), 'ปุ่มเปิดประวัติพาไปหน้าผู้ป่วยเดิม');
  });

  await check('R04', 'reception', 'กรอกเลขบัตรผิด / อายุเกิน', 'ตรวจความถูกต้องของข้อมูล', async (p, ex) => {
    await go(p, '/patients/new', 900);
    await p.fill('.ap-cid', '1234567890123'); await p.waitForTimeout(200);
    ex((await p.locator('.ap-cid[aria-invalid="true"]').count()) === 1, 'เลขบัตร checksum ผิดถูกเตือน');
    await p.locator('.ap-grid input').nth(1).fill('ก'); await p.locator('.ap-grid input').nth(2).fill('ข');
    ex(await p.getByRole('button', { name: 'ถัดไป' }).isDisabled(), 'ไม่มีวันเกิด/เลขบัตรผิด กดถัดไปไม่ได้');
    await p.fill('.ap-cid', ''); await p.fill('input[placeholder="081-234-5678"]', '12'); await p.waitForTimeout(200);
    ex(await p.getByRole('button', { name: 'ถัดไป' }).isDisabled(), 'เบอร์โทรผิดรูปแบบกดถัดไปไม่ได้');
  });

  await check('R05', 'reception', 'หญิงตั้งครรภ์ + ความดันสูง', 'คัดกรองพบข้อห้าม → เตือนทุกจุด', async (p, ex) => {
    await registerViaCard(p);
    await p.locator('.ap-gender button', { hasText: 'หญิง' }).click(); await p.waitForTimeout(200);
    await next(p, 2500);
    await p.fill('input[aria-label="ความดันตัวบน"]', '172'); await p.fill('input[aria-label="ความดันตัวล่าง"]', '100');
    const rows = await p.locator('.ap-qn__row').count();
    ex(rows === 6, 'ผู้หญิงมีคำถามตั้งครรภ์ (6 ข้อ)');
    await answer(p, 5, true);
    ex((await p.locator('.ap-vwarn').count()) === 1, 'เตือนความดันสูงทันที');
    await next(p, 2200);
    ex((await p.locator('.sm-verdict.is-stop').count()) === 1, 'สรุปขึ้น "พบข้อห้าม"');
    await p.getByRole('button', { name: 'บันทึก' }).click(); await p.waitForTimeout(1500);
    ex((await p.locator('.scr-alert.is-stop').count()) === 1, 'หน้าผู้ป่วยมีแถบแดงข้อห้าม');
  });

  await check('R06', 'reception', 'ผู้ชาย', 'ไม่ถามเรื่องตั้งครรภ์', async (p, ex) => {
    await registerViaCard(p);
    await p.locator('.ap-gender button', { hasText: 'ชาย' }).click(); await p.waitForTimeout(200);
    await next(p, 2200);
    ex((await p.locator('.ap-qn__row').count()) === 5, 'ผู้ชายมีคำถาม 5 ข้อ (ไม่มีตั้งครรภ์)');
  });

  await check('R07', 'reception', 'เด็ก 10 ขวบ / ผู้สูงอายุ 85 ปี', 'คำนวณอายุและธาตุ', async (p, ex) => {
    for (const [y, age] of [[2559, 10], [2484, 85]]) {
      await go(p, '/patients/new', 900);
      await p.locator('.ap-grid input').nth(1).fill('อายุ'); await p.locator('.ap-grid input').nth(2).fill(String(age));
      await p.click('.bdc__field'); await p.waitForTimeout(400);
      await p.locator('.bdc__pop select').nth(1).selectOption({ label: String(y) }).catch(() => {});
      await p.locator('.bdc__pop select').nth(0).selectOption({ index: 0 }).catch(() => {});
      await p.locator('.bdc__pop button:has-text("1")').first().click(); await p.waitForTimeout(300);
      await next(p, 1500); await p.getByRole('button', { name: 'ข้ามการคัดกรอง' }).click(); await p.waitForTimeout(500);
      const tags = await p.locator('.sm-tags').innerText().catch(() => '');
      ex(new RegExp(`อายุ ${age - 1}|อายุ ${age}`).test(tags), `อายุ ${age} คำนวณถูก (${tags.replace(/\n/g, ' ')})`);
      ex((await p.locator('.sm-el:not(.is-empty)').count()) === 1, `ธาตุเจ้าเรือนคำนวณได้ (อายุ ${age})`);
    }
  });

  await check('R08', 'reception', 'ผู้ป่วยเดิมเสียบบัตร', 'เปิดประวัติเดิมจากบัตร / ค้นด้วยเลขบัตร', async (p, ex) => {
    const s = await state(p);
    const pt = s.patients[2];
    await mutate(p, "s.patients[2].citizenId='3100500123456'");
    await go(p, '/patients', 1200);
    await p.fill('.phead-search input', '0050012'); await p.waitForTimeout(400);
    ex((await p.locator('.prow').count()) === 1, 'ค้นด้วยเลขบัตรบางส่วนเจอ 1 คน');
    ex((await p.locator('.prow').first().innerText()).includes(pt.name.split(' ')[1]), 'เจอถูกคน');
  });

  await check('R09', 'reception', 'Walk-in จากหน้าตารางนัด', 'เพิ่มคิวนัดผู้ป่วยเดิม', async (p, ex) => {
    await go(p, '/appointments', 1300);
    const before = (await state(p)).appointments.length;
    await p.click('button[aria-label="เพิ่มคิวนัด"]'); await p.waitForTimeout(900);
    // ผู้ป่วยที่วันนี้ยังไม่มีนัด (1 คน 1 นัดต่อวัน)
    for (let k = 3; k < 15; k++) {
      await p.locator('.book__person:not(.book__new)').nth(k).click(); await p.waitForTimeout(400);
      if (!(await p.getByText('มีนัดวันนี้แล้ว').count())) break;
    }
    // late in the day today can be full — then book the next open day
    // 1 คน 1 นัดต่อวัน: วันนั้นมีนัดแล้ว หรือเต็ม → เลือกวันถัดไป
    const blocked = async () => !(await p.locator('.book__slots .tchip:not([disabled])').count()) || (await p.getByText('มีนัดวันนี้แล้ว').count()) > 0;
    for (let i = 0; i < 6 && (await blocked()); i++) {
      await p.locator('.cpick__day--today ~ .cpick__day:not([disabled])').nth(i).click(); await p.waitForTimeout(400);
    }
    const slot = p.locator('.book__slots .tchip:not([disabled])').first();
    if (await slot.count()) await slot.click();
    await p.waitForTimeout(300);
    const staff = p.locator('.book__staff button:not([disabled])').first();
    if (await staff.count()) await staff.click();
    await p.waitForTimeout(300);
    const save = p.getByRole('button', { name: /บันทึกคิว/ });
    ex(await save.isEnabled(), 'ปุ่มบันทึกคิวกดได้หลังเลือกครบ');
    await save.click(); await p.waitForTimeout(1000);
    ex((await state(p)).appointments.length === before + 1, 'เพิ่มนัดลงระบบ');
  });

  await check('R10', 'reception', 'คำขอจองจากแอป · ผ่านคัดกรอง', 'อนุมัติคำขอ', async (p, ex) => {
    // คำขอจากแอปที่ผ่านคัดกรอง (ใส่ในเครื่อง — โหมดทดสอบไม่แตะฐานข้อมูลจริง)
    await mutate(p, `let d=new Date(Date.now()+7*3600e3+864e5);if(d.getUTCDay()===0)d=new Date(d.getTime()+864e5);const iso=d.toISOString().slice(0,10);const free=s.patients.find((pt)=>!pt.cloudId&&!s.appointments.some((a)=>a.patientId===pt.id&&a.date===iso&&a.status!=='cancelled'&&a.status!=='absent'))||s.patients[2];s.requests.unshift({ id: 'rq-qa-ok', patientId: free.id, serviceId: 's1', therapistId: 't2', date: d.toISOString().slice(0,10), start: '14:00', painScore: 5, screening: { fever: false, highBP: false, menstruation: false, pregnant: false, recentSurgery: false, contagious: false }, submittedAt: new Date().toISOString() });`);
    await go(p, '/requests', 1500);
    const before = (await state(p)).requests.length;
    await p.getByRole('button', { name: 'อนุมัติและจัดคิว' }).click(); await p.waitForTimeout(700);
    const dlg = p.locator('.tw-dialog');
    // เลือกผู้บำบัดและเวลาที่ว่างจริง (อนุมัติได้เฉพาะเวลาที่ผู้บำบัดว่าง)
    await dlg.locator('.apv__person:not([disabled])').first().click().catch(() => {}); await p.waitForTimeout(200);
    await dlg.locator('.apv__slots .slot:not([disabled])').first().click().catch(() => {}); await p.waitForTimeout(200);
    const btn = dlg.getByRole('button', { name: /อนุมัติ|ยืนยัน/ }).last();
    await btn.click(); await p.waitForTimeout(1000);
    const s = await state(p);
    ex(s.requests.length === before - 1, 'คำขอหายจากรายการรออนุมัติ');
    ex(s.decisions.some((d) => d.outcome === 'approved' && d.decidedBy === ROLES.reception.staffName), 'บันทึกผู้อนุมัติเป็นเจ้าหน้าที่ต้อนรับ');
  });

  await check('R11', 'reception', 'คำขอจองจากแอป · ความดันสูง', 'ปฏิเสธพร้อมเหตุผล + เลิกทำ', async (p, ex) => {
    // คำขอจากแอปที่ความดันสูง (คำขอทั้งหมดมาจากแอป — ใส่ตรงเพื่อไม่แตะข้อมูลใน cloud)
    await mutate(p, `const q = { id: 'rq-qa-bp', patientId: s.patients[3].id, serviceId: 's2', therapistId: 't2', date: __arg, start: '10:00', painScore: 6, screening: { fever: false, highBP: true, bpSystolic: 172, menstruation: false, pregnant: false, recentSurgery: false, contagious: false }, submittedAt: new Date().toISOString() }; s.requests.unshift(q);`, today());
    const before = (await state(p)).requests.length;
    await go(p, '/requests', 1500);
    await p.locator('.rq__row', { hasText: 'ต้องพบแพทย์' }).first().click(); await p.waitForTimeout(800);
    ex((await p.locator('.rq2__verdict.is-stop').count()) === 1, 'หน้าคำขอขึ้นแดง "ควรให้แพทย์ประเมิน"');
    await p.getByRole('button', { name: 'ปฏิเสธ', exact: true }).click(); await p.waitForTimeout(600);
    await p.getByRole('button', { name: 'ยืนยันการปฏิเสธ' }).click(); await p.waitForTimeout(800);
    let s = await state(p);
    ex(s.decisions.some((d) => d.outcome === 'rejected'), 'บันทึกการปฏิเสธ');
    const toast = p.getByRole('button', { name: 'เลิกทำ' });
    if (await toast.count()) { await toast.click(); await p.waitForTimeout(600); }
    s = await state(p);
    ex(s.requests.length === before, 'เลิกทำแล้วคำขอกลับมา');
  });

  // ===== THERAPIST =====
  await check('T01', 'therapist', 'ผู้ป่วยนัดวันนี้ · ปกติ', 'เรียกคิว → คัดกรอง → เตียง → เริ่ม → จบ (ก่อนเวลา) → บันทึก', async (p, ex) => {
    // a waiting appointment today, not called
    await mutate(p, "const t=new Date(Date.now()+7*3600e3).toISOString().slice(0,10);const a=s.appointments.find(x=>x.date===t&&x.status==='waiting'&&!x.calledAt);a.start='09:00';s.__id=a.id;");
    const id = (await state(p)).__id;
    await openVisit(p, id);
    await p.getByRole('button', { name: 'เรียกคิว', exact: true }).click(); await p.waitForTimeout(1200);
    await p.click('.vscr button'); await p.waitForTimeout(3000);
    ex(p.url().includes('/screen'), 'เปิดหน้าคัดกรองก่อนนวด');
    await p.fill('input[aria-label="ความดันตัวบน"]', '124'); await p.fill('input[aria-label="ความดันตัวล่าง"]', '80'); await p.fill('input[aria-label="ชีพจร"]', '72');
    await p.locator('.ap-pain button').nth(6).click();
    await p.getByRole('button', { name: 'บันทึกผลคัดกรอง' }).click(); await p.waitForTimeout(1500);
    ex((await p.locator('.vscr.is-ok').count()) === 1, 'กลับหน้ารับบริการ แถบเขียวผ่านคัดกรอง');
    await p.locator('.vs__bedbtn:not([disabled])').first().click(); await p.waitForTimeout(300);
    await p.getByRole('button', { name: /^เริ่ม/ }).click(); await p.waitForTimeout(1000);
    await p.getByRole('button', { name: 'จบการรักษา' }).click(); await p.waitForTimeout(700);
    const early = p.locator('.tw-dialog');
    ex((await early.count()) > 0, 'จบก่อนเวลาต้องระบุเหตุผล');
    await early.locator('button[aria-pressed]').first().click();
    await early.getByRole('button', { name: /จบ|ยืนยัน/ }).last().click(); await p.waitForTimeout(1200);
    if (!((await state(p)).appointments.find((a) => a.id === id).diagnoses?.length)) { await p.locator('.cr__add', { has: p.locator('input[placeholder^="พิมพ์หรือเลือกการวินิจฉัย"]') }).locator('.cr__chips button').first().click(); await p.waitForTimeout(300); }
    await p.locator('.cr__add', { has: p.locator('input[placeholder^="พิมพ์หรือเลือกหัตถการ"]') }).locator('.cr__chips button').first().click(); await p.waitForTimeout(300);
    const s1 = await state(p); const ap = s1.appointments.find((a) => a.id === id);
    ex(ap.diagnoses?.length && ap.diagnoses[0].code, 'วินิจฉัยได้รหัส ICD-10 อัตโนมัติ');
    ex(ap.procedures?.length && ap.procedures[0].code, 'หัตถการได้รหัส ICD-9-CM อัตโนมัติ');
    await p.locator('.vs__panel button', { hasText: /^3$/ }).first().click(); await p.waitForTimeout(200);
    await p.getByRole('button', { name: 'บันทึก', exact: true }).click(); await p.waitForTimeout(1000);
    const s2 = await state(p); const a2 = s2.appointments.find((a) => a.id === id);
    ex(a2.painAfter === 3, 'บันทึก Pain หลังนวด = 3');
    ex(s2.audit.some((x) => x.by === ROLES.therapist.staffName), 'ประวัติการแก้ไขบันทึกชื่อผู้บำบัด');
  });

  await check('T02', 'therapist', 'ผู้ป่วยมีไข้วันนี้', 'คัดกรองพบข้อห้าม → ยังเริ่มนวดได้หรือไม่', async (p, ex, notes) => {
    await mutate(p, "const t=new Date(Date.now()+7*3600e3).toISOString().slice(0,10);const a=s.appointments.find(x=>x.date===t&&x.status==='waiting'&&!x.calledAt);s.__id=a.id;");
    const id = (await state(p)).__id;
    await openVisit(p, id);
    await p.getByRole('button', { name: 'เรียกคิว', exact: true }).click(); await p.waitForTimeout(1000);
    await p.click('.vscr button'); await p.waitForTimeout(2800);
    await answer(p, 0, true);
    await p.getByRole('button', { name: 'บันทึกผลคัดกรอง' }).click(); await p.waitForTimeout(1500);
    ex((await p.locator('.scr-alert.is-stop').count()) === 1, 'แถบแดง "พบข้อห้าม" บนหน้ารับบริการ');
    await p.locator('.vs__bedbtn:not([disabled])').first().click(); await p.waitForTimeout(300);
    await p.getByRole('button', { name: /^เริ่ม/ }).click(); await p.waitForTimeout(600);
    ex((await p.locator('.tw-dialog', { hasText: 'พบข้อห้าม' }).count()) === 1, 'กดเริ่มแล้วต้องยืนยันว่าแพทย์ประเมินแล้ว');
    const go2 = p.getByRole('button', { name: /แพทย์ประเมินแล้ว/ });
    ex(await go2.isDisabled(), 'ต้องใส่ชื่อแพทย์ก่อนเริ่ม');
    await p.fill('input[placeholder="ชื่อ-นามสกุล แพทย์ผู้ประเมิน"]', 'พท.ป. กมลชนก ใจงาม');
    await go2.click(); await p.waitForTimeout(900);
    const a = (await state(p)).appointments.find((x) => x.id === id);
    ex(a.status === 'active' && a.startedAt, 'เริ่มรับบริการได้หลังแพทย์ประเมิน');
    ex((a.log || []).some((l) => l.label.includes('ประเมินโดย พท.ป. กมลชนก')), 'บันทึกชื่อแพทย์ผู้ประเมินในประวัติของนัด');
  });

  await check('T03', 'therapist', 'ผู้ป่วยไม่มาตามนัด', 'บันทึกไม่มา → ย้อนกลับ', async (p, ex) => {
    await mutate(p, "const t=new Date(Date.now()+7*3600e3).toISOString().slice(0,10);const a=s.appointments.find(x=>x.date===t&&x.status==='waiting'&&!x.calledAt);s.__id=a.id;");
    const id = (await state(p)).__id;
    await openVisit(p, id);
    // ไม่มา อยู่ในเมนู ⋯
    await p.getByRole('button', { name: 'เพิ่มเติม' }).first().click(); await p.waitForTimeout(300);
    await p.getByRole('menuitem', { name: /ไม่มา/ }).click(); await p.waitForTimeout(800);
    ex((await state(p)).appointments.find((a) => a.id === id).status === 'absent', 'สถานะเป็นไม่มา');
    await p.getByRole('button', { name: 'ย้อนกลับ' }).click(); await p.waitForTimeout(800);
    ex((await state(p)).appointments.find((a) => a.id === id).status === 'waiting', 'ย้อนกลับเป็นรอรับบริการ');
  });

  // ===== CASHIER =====
  await check('C01', 'cashier', 'ผู้ป่วยรายครั้ง · จ่ายเงินสด', 'รับเงินสด + ทอน + ใบเสร็จ', async (p, ex) => {
    await go(p, '/billing', 1300);
    const card = p.locator('.bl2-bill.is-counter, .bl2-bill.is-late').first();
    ex((await card.count()) > 0, 'มีบิลรอคิดเงิน');
    await card.getByRole('button', { name: 'รับชำระ' }).click(); await p.waitForTimeout(1200);
    const credit = p.locator('.vs__credit-line input[type=checkbox]');
    if (await credit.count() && (await credit.isChecked())) await credit.click();
    await p.locator('button', { hasText: /^เงินสด/ }).first().click().catch(() => {});
    const cash = p.locator('.vs__cash input, input[inputmode="numeric"]').last();
    await cash.fill('1000').catch(() => {});
    await p.waitForTimeout(300);
    const pay = p.locator('.tw-drawer').getByRole('button', { name: /^รับชำระ$|หักเครดิต/ });
    await pay.click(); await p.waitForTimeout(1500);
    const s = await state(p);
    const paid = s.appointments.filter((a) => a.payment && a.payment.status === 'paid' && a.payment.at.slice(0, 10) === today());
    ex(paid.some((a) => a.payment.method === 'cash' || a.payment.method === 'credit'), 'ออกใบเสร็จวันนี้');
    ex((await p.locator('.rcx').count()) === 1, 'แสดงใบเสร็จหลังรับเงิน');
  });

  await check('C02', 'cashier', 'ผู้ป่วยมีคอร์ส · บริการตรงคอร์ส', 'หักเครดิตคอร์ส', async (p, ex) => {
    await mutate(p, "const pt=s.patients.find(x=>x.course);const t=new Date(Date.now()+7*3600e3).toISOString().slice(0,10);const a=s.appointments.find(x=>x.patientId===pt.id&&x.status==='active')||s.appointments.find(x=>x.status==='active');a.patientId=pt.id;a.serviceId=pt.course.serviceId;a.endedAt=new Date().toISOString();a.painAfter=3;a.diagnoses=[{name:'x',kind:'principal'}];a.procedures=[{name:'y'}];s.__id=a.id;s.__used=pt.course.used;s.__pid=pt.id;");
    const s0 = await state(p);
    await openVisit(p, s0.__id);
    const credit = p.locator('.vs__credit-line');
    ex((await credit.count()) === 1, 'มีตัวเลือกหักเครดิตเมื่อบริการตรงคอร์ส');
    await p.getByRole('button', { name: /หักเครดิต/ }).click(); await p.waitForTimeout(1200);
    const s = await state(p);
    ex(s.patients.find((x) => x.id === s0.__pid).course.used === s0.__used + 1, 'เครดิตถูกหัก 1 ครั้ง');
  });

  await check('C03', 'cashier', 'ผู้ป่วยมีคอร์ส · บริการไม่ตรงคอร์ส', 'ไม่ให้หักเครดิต', async (p, ex) => {
    await mutate(p, "const pt=s.patients.find(x=>x.course);const a=s.appointments.find(x=>x.status==='active');a.patientId=pt.id;a.serviceId=s.services.find(v=>v.id!==pt.course.serviceId).id;a.endedAt=new Date().toISOString();a.painAfter=3;a.diagnoses=[{name:'x',kind:'principal'}];a.procedures=[{name:'y'}];s.__id=a.id;");
    await openVisit(p, (await state(p)).__id);
    ex((await p.locator('.vs__credit-line').count()) === 0, 'ไม่มีตัวเลือกหักเครดิต');
  });

  await check('C04', 'cashier', 'ผู้ป่วยจ่ายพร้อมเพย์', 'QR พร้อมเพย์', async (p, ex) => {
    await mutate(p, "const a=s.appointments.find(x=>x.status==='active');const pt=s.patients.find(z=>!z.course);a.patientId=pt.id;a.endedAt=new Date().toISOString();a.painAfter=3;a.diagnoses=[{name:'x',kind:'principal'}];a.procedures=[{name:'y'}];s.__id=a.id;");
    await openVisit(p, (await state(p)).__id);
    await p.locator('button', { hasText: 'QR พร้อมเพย์' }).first().click(); await p.waitForTimeout(600);
    ex((await p.locator('svg, canvas, img').count()) > 0, 'แสดง QR');
    await p.getByRole('button', { name: 'รับชำระ', exact: true }).click(); await p.waitForTimeout(1200);
    const a = (await state(p)).appointments.find((x) => x.id === (/* */ null) || x.payment?.method === 'promptpay' && x.payment.at.slice(0, 10) === today());
    ex(!!a, 'บันทึกการชำระแบบพร้อมเพย์');
  });

  await check('C05', 'cashier', 'ผู้ป่วยขอคืนเงิน', 'ยกเลิกใบเสร็จ + คืนเงิน (หน้ารายละเอียดบิล)', async (p, ex) => {
    await go(p, '/billing', 1200);
    await p.locator('button', { hasText: 'ประวัติการชำระ' }).first().click(); await p.waitForTimeout(500);
    await p.locator('button', { hasText: '30 วัน' }).first().click(); await p.waitForTimeout(500);
    await p.locator('.bl2-rc', { hasText: '฿', hasNotText: 'สมศักดิ์' }).first().click(); await p.waitForTimeout(1200);
    ex(p.url().includes('/billing/'), 'เปิดหน้ารายละเอียดบิล');
    const id = p.url().split('/').pop();
    await p.getByRole('button', { name: 'ใบเสร็จ', exact: true }).click(); await p.waitForTimeout(1000);
    await p.locator('.rcx__btn--danger').click(); await p.waitForTimeout(500);
    await p.locator('.rcx button[aria-pressed]').first().click().catch(() => {});
    await p.getByRole('button', { name: /ยืนยันยกเลิกใบเสร็จ/ }).click(); await p.waitForTimeout(1000);
    const a = (await state(p)).appointments.find((x) => x.id === id);
    ex(a.voidedPayments?.length === 1 && !a.paid, 'ใบเสร็จถูกยกเลิก กลับไปรอชำระ');
    ex(a.voidedPayments[0].voided.by === ROLES.cashier.staffName, 'บันทึกผู้ยกเลิกเป็นแคชเชียร์');
  });

  await check('C06', 'cashier', 'สรุปยอด/ส่งออก', 'รายงานและ CSV', async (p, ex) => {
    await go(p, '/billing', 1200);
    await p.getByRole('button', { name: 'รายงาน' }).click(); await p.waitForTimeout(800);
    ex((await p.locator('.tw-dialog').count()) === 1, 'เปิดรายงานสรุป');
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), p.locator('.tw-dialog button', { hasText: /Excel/ }).first().click()]);
    ex(!!dl, 'ดาวน์โหลดไฟล์ CSV ได้');
  });

  // ===== DOCTOR =====
  await check('D01', 'doctor', 'ผู้ป่วยมีคอร์ส · ต้องการยกเลิกบางวัน', 'ยกเลิกนัดตามแผน (เลือกวัน) + คืนเครดิต + เลิกทำ', async (p, ex) => {
    const who = await coursePatient(p);
    await addCourseVisits(p, who);
    await go(p, '/patients', 1300);
    await p.locator('.prow', { hasText: who }).first().click(); await p.waitForTimeout(800);
    const before = await p.locator('.pd2__legend').innerText();
    await p.click('.pd2__cancel'); await p.waitForTimeout(600);
    await p.locator('.cx__scope button').nth(0).click();
    await p.locator('.cx__dates button').nth(2).click(); await p.waitForTimeout(200);
    await p.getByRole('button', { name: /ยกเลิก 2 นัด/ }).click(); await p.waitForTimeout(1000);
    const after = await p.locator('.pd2__legend').innerText();
    const bk = (t) => Number((t.match(/จองไว้\s*(\d+)/) || [])[1]); ex(bk(after) === bk(before) - 2, `เครดิตจองไว้ลดลง 2 (${bk(before)} → ${bk(after)})`);
    await p.getByRole('button', { name: 'เลิกทำ' }).click(); await p.waitForTimeout(800);
    const undone = await p.locator('.pd2__legend').innerText();
    ex(undone === before, `เลิกทำแล้วกลับเหมือนเดิม (${before.replace(/\s+/g, ' ')} → ${undone.replace(/\s+/g, ' ')})`);
  });

  await check('D02', 'doctor', 'เลื่อนนัด', 'หน้ารายละเอียดนัด → เลื่อน', async (p, ex) => {
    const s = await state(p);
    // 1 คน 1 นัดต่อวัน: เลือกนัดที่วันนั้นผู้ป่วยไม่มีนัดอื่น
    const a = s.appointments.find((x) => x.status === 'waiting' && x.date > today() && !x.cloudId && !s.appointments.some((y) => y.id !== x.id && y.patientId === x.patientId && y.date === x.date && y.status !== 'cancelled' && y.status !== 'absent'));
    await go(p, '/appointments/' + a.id, 1200);
    await p.getByRole('button', { name: 'เลื่อนนัด', exact: true }).click(); await p.waitForTimeout(500);
    await p.locator('.ad__slots button:not([disabled])', { hasNotText: a.start }).last().click();
    await p.getByRole('button', { name: 'ยืนยันเลื่อนนัด' }).click(); await p.waitForTimeout(800);
    const a2 = (await state(p)).appointments.find((x) => x.id === a.id);
    ex(a2.start !== a.start, `เวลาเปลี่ยน ${a.start} → ${a2.start}`);
    ex((a2.log ?? []).some((l) => l.label.startsWith('เลื่อนนัด')), 'บันทึกในประวัติของนัด');
  });

  await check('D03', 'doctor', 'แผนการรักษาโดย AI', 'สร้างแผน (ต้องต่อเน็ต) / แสดงข้อผิดพลาดถ้าไม่สำเร็จ', async (p, ex, notes) => {
    await go(p, '/patients', 1300);
    await p.locator('.prow', { hasText: 'ทองใบ' }).first().click(); await p.waitForTimeout(800);
    await p.locator('.ptx--plan .pd2__act').click(); await p.waitForTimeout(1500);
    ex((await p.locator('.ai-busy, .aip, .ai-error').count()) > 0, 'กดแล้ว AI เริ่มวิเคราะห์');
    await p.waitForTimeout(45000);
    const done = await p.locator('.aip').count();
    const err = await p.locator('.ai-error').count();
    notes.push(done ? '✓ AI สร้างแผนสำเร็จ' : err ? '⚠ AI ตอบไม่สำเร็จ · แสดงข้อความแจ้ง' : '⚠ AI ยังไม่ตอบใน 45 วินาที');
    if (done) {
      await p.getByRole('button', { name: 'แพทย์อนุมัติ', exact: true }).click(); await p.waitForTimeout(800);
      ex((await state(p)).patients.find((x) => x.name.includes('ทองใบ')).aiPlan.approved, 'แพทย์อนุมัติแผนแล้ว');
    }
  });

  // ===== ADMIN =====
  await check('A01', 'admin', 'เปลี่ยนเกณฑ์ความดัน', 'เกณฑ์ใหม่มีผลกับการคัดกรอง', async (p, ex) => {
    await mutate(p, "s.settings.bpThreshold=140");
    await registerViaCard(p);
    await next(p, 2400);
    await p.fill('input[aria-label="ความดันตัวบน"]', '145');
    ex((await p.locator('.ap-vwarn').count()) === 1, 'ความดัน 145 ถูกเตือนเมื่อเกณฑ์ = 140');
  });

  await check('A02', 'admin', 'สลับผู้ใช้งาน', 'ประวัติการแก้ไขแยกตามผู้ใช้', async (p, ex) => {
    await go(p, '/settings', 1000);
    await p.locator('.st-nav__item', { hasText: 'ประวัติการแก้ไข' }).click(); await p.waitForTimeout(800);
    ex((await p.locator('.st-page').innerText()).length > 0, 'เปิดหน้าประวัติการแก้ไข');
    await setRole(p, 'cashier');
    await mutate(p, "s.settings.clinicName=s.settings.clinicName");
    await go(p, '/settings', 1000);
    ex((await p.locator('.st-me').innerText()).includes('สมใจ'), 'โปรไฟล์ผู้ใช้เปลี่ยนเป็นแคชเชียร์');
  });

  await check('A03', 'admin', 'สำรอง / กู้คืนข้อมูล', 'ดาวน์โหลดไฟล์สำรอง', async (p, ex) => {
    await go(p, '/settings', 1000);
    await p.locator('.st-nav__item', { hasText: 'ข้อมูลและการสำรอง' }).click(); await p.waitForTimeout(600);
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), p.getByRole('button', { name: 'ดาวน์โหลด' }).click()]);
    ex(!!dl, 'ดาวน์โหลดไฟล์สำรองได้');
  });


  await check('R12', 'reception', 'ผู้ป่วยเดิมแจ้งเปลี่ยนข้อมูล', 'แก้ไขข้อมูลผู้ป่วย', async (p, ex) => {
    await go(p, '/patients', 1300);
    await p.locator('.prow').nth(1).click(); await p.waitForTimeout(700);
    await p.click('.pd__icons button[aria-label="เพิ่มเติม"]'); await p.waitForTimeout(300);
    await p.locator('.more button', { hasText: 'แก้ไขข้อมูล' }).click(); await p.waitForTimeout(1300);
    ex(p.url().includes('/edit'), 'เปิดหน้าแก้ไข');
    await p.fill('input[type="email"]', 'edit@test.co');
    await next(p, 1800); await next(p, 1800);
    await p.getByRole('button', { name: 'บันทึก' }).click(); await p.waitForTimeout(1200);
    const s = await state(p);
    ex(s.patients.some((x) => x.email === 'edit@test.co'), 'บันทึกอีเมลใหม่');
    ex(s.audit.some((a) => a.by === ROLES.reception.staffName && /แก้ไข/.test(a.text)), 'ประวัติการแก้ไขบันทึกการแก้ข้อมูลผู้ป่วย');
  });

  await check('D04', 'doctor', 'ผู้ป่วยหยุดคอร์ส', 'ยกเลิกนัดที่เหลือทั้งหมดของแผน', async (p, ex) => {
    const who = await coursePatient(p);
    await addCourseVisits(p, who);
    await go(p, '/patients', 1300);
    await p.locator('.prow', { hasText: who }).first().click(); await p.waitForTimeout(800);
    await p.click('.pd2__cancel'); await p.waitForTimeout(600);
    const n = await p.locator('.cx__dates button').count();
    await p.locator('.cx__scope button').nth(1).click();
    await p.locator('.cx__seg button', { hasText: 'คลินิกยกเลิก' }).click();
    await p.getByRole('button', { name: new RegExp(`ยกเลิก ${n} นัด`) }).click(); await p.waitForTimeout(1000);
    const s = await state(p);
    const pt = s.patients.find((x) => x.name === who);
    const svc = (pt.course ?? pt.pastCourses?.[0])?.serviceId;
    const left = s.appointments.filter((a) => a.patientId === pt.id && a.serviceId === svc && a.status === 'waiting' && !a.calledAt && a.date >= today()).length;
    ex(left === 0, `ยกเลิกครบ ${n} นัด`);
    ex(!pt.course && pt.pastCourses?.[0]?.reason.startsWith('หยุดคอร์ส'), 'ปิดคอร์ส (ย้ายไปคอร์สที่ผ่านมา)');
    ex(s.appointments.filter((a) => a.cancel?.by === 'clinic').length === n, 'บันทึกว่าคลินิกเป็นผู้ยกเลิก');
  });

  await check('C07', 'cashier', 'ผู้ป่วยขอจ่ายผ่านแอป', 'ส่งบิลเข้าแอป → รอชำระในแอป', async (p, ex) => {
    await mutate(p, "const a=s.appointments.find(x=>x.status==='active');const pt=s.patients.find(z=>!z.course);a.patientId=pt.id;a.endedAt=new Date().toISOString();a.painAfter=3;a.diagnoses=[{name:'x',kind:'principal'}];a.procedures=[{name:'y'}];s.__id=a.id;");
    const id = (await state(p)).__id;
    await openVisit(p, id);
    await p.locator('button', { hasText: 'บิลเข้าแอป' }).first().click(); await p.waitForTimeout(400);
    await p.getByRole('button', { name: 'ส่งบิลเข้าแอป', exact: true }).click(); await p.waitForTimeout(1200);
    const a = (await state(p)).appointments.find((x) => x.id === id);
    ex(a.payment?.status === 'pending', 'บิลสถานะรอชำระในแอป');
    await go(p, '/billing/' + id, 1200);
    ex((await p.locator('.adp__status').innerText()).includes('รอชำระในแอป'), 'หน้ารายละเอียดบิลแสดงรอชำระในแอป');
  });


  // ===== BACK-OFFICE (stock / packages / commission / day close / tax / documents / waitlist) =====
  const noPrint = (p) => p.evaluate(() => { window.print = () => window.dispatchEvent(new Event('afterprint')); });
  await check('B01', 'cashier', 'ผู้ป่วยไม่มีคอร์ส · ซื้อแพ็กเกจแบบมัดจำ', 'ขายคอร์ส + มัดจำ → รับชำระคงค้างทีหลัง', async (p, ex) => {
    const s0 = await state(p);
    const pt = s0.patients.find((x) => !x.course);
    await go(p, '/patients?id=' + pt.id, 1300);
    await p.click('.pd2__sell'); await p.waitForTimeout(600);
    await p.locator('.sp__pkgs button').first().click();
    await p.locator('.sp__seg button', { hasText: 'รับมัดจำ' }).click();
    await p.locator('.sp input[inputmode="numeric"]').last().fill('1000');
    await p.getByRole('button', { name: /รับมัดจำ 1,000 บาท/ }).click(); await p.waitForTimeout(1000);
    const s1 = await state(p);
    const pt1 = s1.patients.find((x) => x.id === pt.id);
    const sale = s1.biz.sales[0];
    ex(pt1.course && pt1.course.total > 0, `เปิดคอร์สให้ผู้ป่วย (${pt1.course?.total} ครั้ง)`);
    ex(sale && sale.payments[0].kind === 'deposit' && sale.payments[0].amount === 1000, 'บันทึกมัดจำ 1,000 บาท');
    ex(/^PK\d{4}-/.test(sale?.no ?? ''), 'ออกเลขที่การขาย ' + sale?.no);
    await go(p, '/packages', 1000);
    await p.locator('.bz-tabs button', { hasText: 'ยอดขาย' }).click(); await p.waitForTimeout(400);
    await p.getByRole('button', { name: 'รับชำระ' }).first().click(); await p.waitForTimeout(500);
    await p.locator('.tw-dialog').getByRole('button', { name: /^รับชำระ \d/ }).click(); await p.waitForTimeout(800);
    const sale2 = (await state(p)).biz.sales[0];
    ex(sale2.payments.reduce((n, x) => n + x.amount, 0) === sale2.net, 'รับชำระคงค้างครบยอด');
  });

  await check('B02', 'therapist', 'บันทึกการรักษาเสร็จ', 'ตัดสต็อกลูกประคบ/น้ำมันอัตโนมัติ (ครั้งเดียว)', async (p, ex) => {
    await mutate(p, "const a=s.appointments.find(x=>x.status==='active');a.endedAt=new Date().toISOString();a.diagnoses=[{name:'ปวดหลัง',kind:'principal'}];a.procedures=[{name:'นวด'}];s.__id=a.id;s.__svc=a.serviceId;");
    const s0 = await state(p);
    const use = s0.biz.usage[s0.__svc] || [];
    await openVisit(p, s0.__id);
    await p.locator('.vs__panel button', { hasText: /^3$/ }).first().click(); await p.waitForTimeout(200);
    await p.getByRole('button', { name: 'บันทึก', exact: true }).click(); await p.waitForTimeout(1000);
    const s1 = await state(p);
    const moves = s1.biz.moves.filter((m) => m.apptId === s0.__id);
    ex(use.length > 0 && moves.length === use.length, `ตัดสต็อก ${moves.length} รายการตามบริการ`);
    ex(use.every((u) => s1.biz.items.find((i) => i.id === u.itemId).stock === s0.biz.items.find((i) => i.id === u.itemId).stock - u.qty), 'ยอดคงเหลือลดลงตรงตามที่ตั้งไว้');
    ex(s1.audit.some((x) => x.cat === 'คลังสินค้า'), 'ประวัติการแก้ไขมีหมวดคลังสินค้า');
    await go(p, '/inventory', 1000);
    ex((await p.locator('.bz-row').count()) >= 5, 'หน้าคลังสินค้าแสดงรายการ');
  });

  await check('B03', 'cashier', 'สิ้นวัน', 'ปิดยอด: นับเงินสด = ยอดในระบบ + ฝากธนาคาร', async (p, ex) => {
    const s0 = await state(p);
    const cash = s0.appointments.filter((a) => a.payment?.status === 'paid' && a.payment.method === 'cash' && a.payment.at.slice(0, 10) === today()).reduce((n, a) => n + a.payment.amount, 0);
    await go(p, '/billing/close', 1000);
    await noPrint(p);
    await p.fill('input[aria-label="จำนวน 1"]', String(1000 + cash));
    ex((await p.locator('.dc__diff.is-ok').count()) === 1, 'เงินสดตรงยอด');
    await p.getByRole('button', { name: 'ยืนยันปิดยอด' }).click(); await p.waitForTimeout(800);
    const c = (await state(p)).biz.closings[0];
    ex(c && c.diff === 0 && c.deposit === cash, `บันทึกปิดยอด · ฝาก ${c?.deposit} บาท`);
    await p.fill('input[aria-label="จำนวน 1"]', String(cash + 900));
    ex((await p.locator('.dc__diff.is-short').count()) === 1, 'นับขาด 100 → แสดงเงินขาด');
    ex(await p.getByRole('button', { name: 'ยืนยันปิดยอด' }).isDisabled(), 'เงินไม่ตรงต้องใส่หมายเหตุก่อน');
  });

  await check('B04', 'cashier', 'ลูกค้าบริษัทขอใบกำกับภาษี', 'คลินิกจด VAT → ออกใบกำกับภาษีเต็มรูป', async (p, ex) => {
    await mutate(p, "s.settings.vat={registered:true,taxId:'0105560000001',branch:'สำนักงานใหญ่',address:'1 ถ.สุขุมวิท กรุงเทพฯ',rate:7};const a=s.appointments.find(x=>x.payment&&x.payment.status==='paid'&&x.payment.method!=='credit'&&x.payment.amount>0);s.__id=a.id;");
    const id = (await state(p)).__id;
    await go(p, '/billing/' + id, 1200);
    await noPrint(p);
    await p.getByRole('button', { name: 'ใบเสร็จ', exact: true }).click(); await p.waitForTimeout(1800);
    await p.getByRole('button', { name: 'ออกใบกำกับภาษี' }).click(); await p.waitForTimeout(600);
    await p.locator('.tw-dialog input').first().fill('บริษัท ทดสอบ จำกัด');
    await p.getByRole('button', { name: 'ออกและพิมพ์' }).click(); await p.waitForTimeout(800);
    const a = (await state(p)).appointments.find((x) => x.id === id);
    ex(/^TX\d{4}-/.test(a.payment.taxInvoice?.no ?? ''), 'ออกเลขที่ใบกำกับภาษี ' + a.payment.taxInvoice?.no);
    ex(a.payment.taxInvoice?.buyer === 'บริษัท ทดสอบ จำกัด', 'บันทึกชื่อผู้ซื้อ');
  });

  await check('B05', 'doctor', 'ผู้ป่วยขอใบรับรองแพทย์ / ต้องส่งต่อ รพ.', 'ออกใบรับรองแพทย์ + ใบส่งตัว', async (p, ex) => {
    const pt = (await state(p)).patients[0];
    await go(p, '/patients?id=' + pt.id, 1300);
    await noPrint(p);
    for (const [label, kind] of [['ใบรับรองแพทย์', 'cert'], ['ใบส่งตัว', 'refer']]) {
      await p.click('[aria-label="เพิ่มเติม"]'); await p.waitForTimeout(300);
      await p.locator('.more button', { hasText: label }).click(); await p.waitForTimeout(600);
      const d = p.locator('.tw-dialog');
      const tas = d.locator('textarea');
      if (kind === 'cert') { await tas.nth(1).fill('ควรหลีกเลี่ยงการยกของหนัก'); await d.locator('input[inputmode="numeric"]').fill('2'); }
      else { await d.locator('input').nth(2).fill('รพ.ทดสอบ'); await tas.nth(1).fill('ชาร้าวลงขา'); }
      await p.getByRole('button', { name: 'ออกเอกสารและพิมพ์' }).click(); await p.waitForTimeout(800);
    }
    const docs = (await state(p)).biz.docs;
    ex(docs.some((x) => x.kind === 'cert' && /^MC/.test(x.no) && x.restDays === 2), 'ออกใบรับรองแพทย์ (พัก 2 วัน)');
    ex(docs.some((x) => x.kind === 'refer' && /^RF/.test(x.no) && x.referTo === 'รพ.ทดสอบ'), 'ออกใบส่งตัว');
    ex(docs.every((x) => x.doctor === ROLES.doctor.staffName), 'ชื่อแพทย์ผู้ออกเอกสาร');
  });

  await check('B06', 'reception', 'มีคนยกเลิกนัด · มีคนรอคิวช่วงเวลานั้น', 'รายการรอคิว → แจ้งอัตโนมัติ → จองให้', async (p, ex) => {
    await mutate(p, "const t=new Date(Date.now()+7*3600e3).toISOString().slice(0,10);const a=s.appointments.find(x=>x.date>t&&x.status==='waiting'&&!x.calledAt&&!s.patients.find(q=>q.id===x.patientId).course);const w=s.patients.find(q=>q.id!==a.patientId);s.biz.waitlist=[{id:'wl1',at:new Date().toISOString(),patientId:w.id,serviceId:'s1',date:a.date,from:'08:00',to:'20:00',status:'waiting'}];s.__id=a.id;");
    const id = (await state(p)).__id;
    await go(p, '/appointments', 1200);
    ex((await p.locator('.wl__row').count()) === 1, 'แสดงคนรอคิวบนหน้าตารางนัด');
    await go(p, '/appointments/' + id, 1200);
    await p.getByRole('button', { name: 'ยกเลิกนัด' }).first().click(); await p.waitForTimeout(600);
    await p.getByRole('button', { name: 'ยืนยันยกเลิกนัด' }).click(); await p.waitForTimeout(600);
    const toast = await p.locator('body').innerText();
    ex(toast.includes('แจ้งคนรอคิว 1 คน'), 'แจ้งเตือนว่าแจ้งคนรอคิวแล้ว');
    ex((await state(p)).biz.waitlist[0].status === 'notified', 'สถานะคนรอคิว = แจ้งแล้ว');
    await go(p, '/appointments', 1200);
    await p.locator('.wl__book').first().click(); await p.waitForTimeout(900);
    ex((await p.locator('.tw-dialog').count()) > 0, 'กด "จองให้" เปิดหน้าจองพร้อมชื่อผู้ป่วย');
  });

  await check('B08', 'reception', 'ผู้ป่วยโทรมาขอคิว แต่คิวเต็ม', 'เพิ่มชื่อเข้ารายการรอคิว', async (p, ex) => {
    await go(p, '/appointments', 1200);
    await p.click('.wl .rail-clear'); await p.waitForTimeout(600);
    await p.locator('.tw-dialog input').first().fill('สมพร'); await p.waitForTimeout(300);
    await p.locator('.wl__found button').first().click(); await p.waitForTimeout(300);
    ex((await p.locator('.wl__picked').count()) === 1, 'เลือกผู้ป่วยจากผลค้นหาได้');
    await p.getByRole('button', { name: 'เพิ่มเข้ารายการ' }).click(); await p.waitForTimeout(800);
    ex((await state(p)).biz.waitlist.length === 1 && (await p.locator('.wl__row').count()) === 1, 'แสดงในรายการรอคิว');
  });

  await check('B07', 'admin', 'สรุปค่ามือประจำเดือน', 'ค่ามือ = เคส × บาท/เคส + % รายได้ · แก้อัตรา', async (p, ex) => {
    await go(p, '/billing/commission', 1200);
    const rows = await p.locator('.bz-table tbody tr').count();
    ex(rows === (await state(p)).therapists.length, `แสดงผู้บำบัดครบ ${rows} คน`);
    const inp = p.locator('.bz-table tbody tr').first().locator('input').first();
    await inp.fill('200'); await inp.blur(); await p.waitForTimeout(500);
    const s = await state(p);
    ex(s.biz.rates[s.therapists[0].id].perCase === 200, 'แก้ค่ามือต่อเคสแล้วบันทึก');
    const dl = p.waitForEvent('download', { timeout: 4000 }).catch(() => null);
    await p.getByRole('button', { name: 'ส่งออก Excel' }).click();
    ex(!!(await dl), 'ส่งออก CSV ได้');
  });


  // ===== INNOVATION (outcomes evidence / สมุฏฐานวินิจฉัย / voice record) =====
  await check('N01', 'doctor', 'ผู้ป่วยเปิดประวัติ', 'สมุฏฐานวินิจฉัย 5 ด้าน + ผลจริงของคลินิก', async (p, ex) => {
    await go(p, '/patients', 1500);
    // ธาตุเจ้าเรือน + สมุฏฐาน พับเก็บไว้ → เปิดก่อน
    await p.evaluate(() => document.querySelectorAll('details').forEach((d) => { if (d.querySelector('.tm__body')) d.open = true; }));
    await p.locator('.tm__body').scrollIntoViewIfNeeded();
    ex((await p.locator('.tm__factors > li').count()) === 6, 'แสดงสมุฏฐาน 5 ด้าน + อาการวันนี้');
    ex((await p.locator('.tm__box.is-risk .tm__hero b').innerText()).startsWith('ธาตุ'), 'สรุปธาตุที่เสี่ยงเสียสมดุล');
    ex((await p.locator('.tm__ev li').count()) > 0, 'แสดงบริการที่ได้ผลดีที่สุดกับธาตุเดียวกันจากข้อมูลคลินิก');
  });

  await check('N02', 'admin', 'ผู้บริหาร / งานวิจัย', 'แดชบอร์ดผลการรักษา + ส่งออกข้อมูลไม่ระบุตัวตน', async (p, ex) => {
    await go(p, '/insights', 1500);
    const lead = await p.locator('.in-hero').innerText();
    ex(/ลดลงเฉลี่ย/.test(lead), 'สรุปปวดก่อน → หลังนวด');
    ex((await p.locator('.in-find').count()) > 0, 'มีข้อค้นพบจากข้อมูล');
    await p.locator('.in-find').first().click(); await p.waitForTimeout(500);
    ex((await p.locator('.in-reco').count()) === 1, 'กดข้อค้นพบ → เปิดมุมมองตามธาตุพร้อมคำแนะนำ');
    ex((await p.locator('.in-heat__cell').count()) === 4 * (await state(p)).services.length, 'ตารางธาตุ × บริการครบ');
    await p.locator('.appt__bar button', { hasText: 'ตามบริการ' }).click(); await p.waitForTimeout(400);
    ex((await p.locator('.in-row').count()) === (await state(p)).services.length, 'มุมมองตามบริการแสดงครบ');
    const dl = p.waitForEvent('download', { timeout: 4000 }).catch(() => null);
    await p.getByRole('button', { name: 'ส่งออกข้อมูลวิจัย' }).click();
    const d = await dl;
    ex(!!d, 'ส่งออก CSV ได้');
    if (d) {
      const txt = fs.readFileSync(await d.path(), 'utf8');
      const s = await state(p);
      ex(!s.patients.slice(0, 20).some((x) => txt.includes(x.name) || txt.includes(x.hn)), 'ไฟล์ไม่มีชื่อและ HN ผู้ป่วย');
    }
  });

  // ผู้ช่วยบันทึกการรักษา (แบบใหม่): พูด/พิมพ์ครั้งเดียว → AI แยกใส่ 5 ช่อง · ถามต่อเฉพาะช่องที่ขาด
  const chatIdle = async (p) => { await p.waitForTimeout(300); await p.waitForFunction(() => !document.querySelector('.qr-typing'), null, { timeout: 90000 }); await p.waitForTimeout(400); };
  const qrSend = async (p, t) => { await p.fill('textarea[aria-label="สรุปการรักษา"]', t); await p.getByRole('button', { name: 'ส่งข้อความ' }).click(); await chatIdle(p); };
  const qrOpen = async (p) => {
    await mutate(p, "const a=s.appointments.find(x=>x.status==='active');a.endedAt=new Date().toISOString();a.diagnoses=[];a.procedures=[];delete a.findings;delete a.painAfter;delete a.advice;s.__id=a.id;");
    const id = (await state(p)).__id;
    await openVisit(p, id);
    // การ์ดบันทึกย่ออยู่ → เปิดดูทุกช่อง
    await p.locator('.qr-card__head').click(); await p.waitForTimeout(200);
    return id;
  };
  const row = (p, label) => p.locator('.qr-row', { hasText: label });

  await check('N03', 'therapist', 'เล่ารวดเดียว AI กรอกให้ครบ', 'พิมพ์ 1 ครั้ง → ตรวจพบ · วินิจฉัย(รหัส) · หัตถการ 45 นาที · ปวดหลัง 3 · คำแนะนำ → บันทึก', async (p, ex) => {
    const id = await qrOpen(p);
    ex((await p.locator('.vp__voice .qr').count()) === 1, 'ขั้นบันทึกการรักษาเปิดผู้ช่วยบันทึกด้านขวาเอง');
    ex((await p.locator('.qr-row').count()) === 5, 'การ์ดบันทึก 5 ช่อง');
    await qrSend(p, 'บ่าขวาตึง กดเจ็บ ยกแขนลำบาก วินิจฉัยลมปลายปัตคาด นวดรักษาเส้นอิทาบ่าไหล่ 45 นาที หลังนวดเหลือปวด 3 แนะนำประคบอุ่นที่บ้านวันละ 15 นาที');
    const a = (await state(p)).appointments.find((x) => x.id === id);
    ex(/บ่า/.test(a.findings ?? ''), `เติมสิ่งที่ตรวจพบ (${a.findings})`);
    ex(a.diagnoses?.length > 0 && !!a.diagnoses[0].code, 'เติมวินิจฉัยพร้อมรหัส ICD-10');
    ex(a.procedures?.some((x) => x.minutes === 45), 'เติมหัตถการ 45 นาที');
    ex(/3/.test(await row(p, 'ปวดหลังนวด').innerText()), 'ปวดหลังนวด = 3');
    ex((await row(p, 'คำแนะนำ').innerText()).includes('ประคบ'), 'เติมคำแนะนำตามที่พูด');
    ex((await p.locator('.qr-row.is-done, .qr-row.is-check').count()) === 5, 'ครบ 5 ช่อง');
    // ยืนยันช่องที่ AI ไม่แน่ใจ (ถ้ามี) แล้วบันทึก
    for (let i = 0; i < 5 && (await p.locator('.qr-acts .is-ok').count()); i++) { await p.locator('.qr-acts .is-ok').first().click(); await chatIdle(p); }
    await p.locator('.qr-chips button', { hasText: 'บันทึกการรักษา' }).last().click(); await p.waitForTimeout(1000);
    const b = (await state(p)).appointments.find((x) => x.id === id);
    ex(b.painAfter === 3 && /ประคบ/.test(b.advice ?? ''), 'กดบันทึก → Pain หลังนวดและคำแนะนำถูกบันทึก');
  });

  await check('N04', 'therapist', 'ผู้บำบัดส่งเสียงสรุป (ไฟล์เสียงจริงภาษาไทย)', 'ไฟล์เสียง → ถอดเสียง → แยกใส่ช่อง', async (p, ex) => {
    const id = await qrOpen(p);
    await p.locator('input[aria-label="ไฟล์เสียงสรุปการรักษา"]').setInputFiles(path.join(__dirname, 'fixtures/voice-summary-th.m4a'));
    await p.waitForFunction(() => document.querySelectorAll('.qr-msg.is-me').length > 1, null, { timeout: 90000 });
    await chatIdle(p);
    const heard = await p.locator('.qr-msg.is-me').nth(1).innerText();
    ex(/ปัต/.test(heard) && /ประคบ/.test(heard), 'ถอดเสียงภาษาไทยเป็นข้อความในแชท');
    const a = (await state(p)).appointments.find((x) => x.id === id);
    ex((a.diagnoses?.length ?? 0) + (a.procedures?.length ?? 0) > 0 || !!a.findings, 'เสียงถูกแยกใส่บันทึก');
  });

  await check('N05', 'therapist', 'AI ถามต่อเฉพาะช่องที่ขาด', 'บอกแค่อาการ → ถามวินิจฉัยพร้อมตัวเลือก → แตะเลือก → ถามหัตถการต่อ', async (p, ex) => {
    const id = await qrOpen(p);
    await qrSend(p, 'บ่าขวาตึงมาก กดเจ็บ ยกแขนลำบาก');
    let a = (await state(p)).appointments.find((x) => x.id === id);
    ex(/บ่า/.test(a.findings ?? '') && !(a.diagnoses?.length) && !(a.procedures?.length), 'เก็บเฉพาะอาการที่ตรวจพบ ไม่เดาช่องอื่น');
    const last = p.locator('.qr-msg.is-ai').last();
    ex(/วินิจฉัย/.test(await last.innerText()), 'ถามวินิจฉัยต่อ');
    ex((await last.locator('.qr-chips button').count()) > 0, 'มีตัวเลือกวินิจฉัยจาก AI ให้แตะ');
    await last.locator('.qr-chips button').first().click(); await chatIdle(p);
    a = (await state(p)).appointments.find((x) => x.id === id);
    ex(a.diagnoses.length === 1, 'แตะแล้วบันทึกวินิจฉัย 1 ข้อ');
    ex(/หัตถการ/.test(await p.locator('.qr-msg.is-ai').last().innerText()), 'แล้วถามหัตถการต่อ');
  });

  await check('N06', 'therapist', 'สั่งแก้ด้วยคำพูด', '“เปลี่ยนวินิจฉัยเป็น…” → แทนที่ของเดิม', async (p, ex) => {
    const id = await qrOpen(p);
    await qrSend(p, 'บ่าตึง วินิจฉัยลมปลายปัตคาด');
    await qrSend(p, 'เปลี่ยนวินิจฉัยเป็นลมจับโปงแห้งเข่า');
    const a = (await state(p)).appointments.find((x) => x.id === id);
    ex(a.diagnoses.length === 1 && /จับโปง/.test(a.diagnoses[0].name), `แทนที่วินิจฉัยเดิม (${a.diagnoses.map((d) => d.name).join(', ')})`);
  });

  await check('N07', 'therapist', 'ความแม่นของคะแนนปวด', 'ปวดก่อนนวดไม่ถูกบันทึกเป็นปวดหลังนวด', async (p, ex) => {
    const id = await qrOpen(p);
    await qrSend(p, 'ก่อนนวดผู้ป่วยปวด 7 บ่าตึง');
    ex(!/7/.test(await row(p, 'ปวดหลังนวด').innerText()), 'ไม่เอาปวดก่อนนวดมาใส่ปวดหลังนวด');
    await qrSend(p, 'หลังนวดเหลือ 2');
    ex(/2/.test(await row(p, 'ปวดหลังนวด').innerText()), 'ปวดหลังนวด = 2 เมื่อพูดชัด');
  });

  await check('N09', 'therapist', 'ผู้ป่วยไม่ประเมินปวดหลังนวด', 'ถามปวดหลังนวด → กด “ข้าม” → ไปถามคำแนะนำ ไม่ถามซ้ำ', async (p, ex) => {
    await qrOpen(p);
    await qrSend(p, 'บ่าขวาตึง วินิจฉัยลมปลายปัตคาด นวดรักษา 45 นาที');
    for (let i = 0; i < 4 && (await p.locator('.qr-acts .is-ok').count()); i++) { await p.locator('.qr-acts .is-ok').first().click(); await chatIdle(p); }
    const last = p.locator('.qr-msg.is-ai').last();
    ex(/ปวดเหลือ/.test(await last.innerText()) && (await last.locator('.qr-chips button').count()) === 12, 'ถามปวดหลังนวดพร้อมแถบ 0–10 และ “ผู้ป่วยไม่ประเมิน”');
    await last.locator('.qr-chips button', { hasText: 'ไม่ประเมิน' }).click(); await chatIdle(p);
    ex(/ไม่ประเมิน/.test(await row(p, 'ปวดหลังนวด').innerText()), 'ช่องปวดหลังนวด = ผู้ป่วยไม่ประเมิน');
    ex(/คำแนะนำ/.test(await p.locator('.qr-msg.is-ai').last().innerText()), 'ถามคำแนะนำต่อ ไม่ถามปวดซ้ำ');
  });

  await check('N08', 'therapist', 'แก้ในการ์ดบันทึก', 'แตะดินสอที่ช่อง → แก้ข้อความ → บันทึกลงนัด', async (p, ex) => {
    const id = await qrOpen(p);
    await row(p, 'ตรวจพบ').locator('button[aria-label="แก้ตรวจพบ"]').click();
    await row(p, 'ตรวจพบ').locator('textarea').fill('หลังส่วนล่างตึง ก้มลำบาก');
    await row(p, 'ตรวจพบ').getByRole('button', { name: 'ตกลง' }).click(); await p.waitForTimeout(500);
    const a = (await state(p)).appointments.find((x) => x.id === id);
    ex(a.findings === 'หลังส่วนล่างตึง ก้มลำบาก', 'แก้สิ่งที่ตรวจพบในการ์ดได้');
  });

  // ===== CROSS-CUTTING =====
  await check('X01', 'reception', 'ทุกหน้า', 'เปิดได้ไม่มี error (แนวนอน + แนวตั้ง)', async (p, ex) => {
    const s = await state(p);
    const a = s.appointments.find((x) => x.payment);
    const routes = ['/', '/visits', '/patients', '/patients/new', '/appointments', '/appointments/' + a.id, '/billing', '/billing/' + a.id, '/planner', '/requests', '/settings', '/inventory', '/packages', '/billing/close', '/billing/commission', '/insights', '/tutorial/'];
    for (const vp of [{ width: 1366, height: 1024 }, { width: 820, height: 1180 }]) {
      await p.setViewportSize(vp);
      for (const r of routes) {
        await go(p, r, 900);
        const sw = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
        ex(!sw, `${vp.width}px ${r} ไม่มีเลื่อนแนวนอนเกินจอ`);
      }
    }
  });

  await check('X02', 'reception', 'ข้อมูลคงอยู่', 'รีโหลดแล้วข้อมูลยังอยู่', async (p, ex) => {
    await mutate(p, "s.patients[0].complaint='ทดสอบคงอยู่'");
    await p.reload({ waitUntil: 'networkidle' });
    ex((await state(p)).patients[0].complaint === 'ทดสอบคงอยู่', 'ข้อมูลยังอยู่หลังรีโหลด');
  });

  fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(results, null, 1));
  const f = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - f}/${results.length} passed`);
  await b.close();
})();
