/* ThaiWell Academy — chapters, synced video steps, screenshots, progress */
const INFO = {
  home: { title: "หน้าหลักและคำขอจองคิว", short: "หน้าหลัก", color: "#4c845a", icon: "⌂", desc: "ภาพรวมของวันนี้ รายการงาน และการอนุมัติคำขอจองคิวที่ผู้ป่วยส่งมาจากแอป" },
  register: { title: "ลงทะเบียนผู้รับบริการใหม่", short: "ลงทะเบียน", color: "#3b82c4", icon: "✚", desc: "อ่านบัตรประชาชน คัดกรองด้วยหุ่น 3D ตอบคำถามก่อนนวด และตรวจหน้าสรุปพร้อมวิเคราะห์ธาตุ" },
  patient: { title: "ค้นหาและดูประวัติผู้ป่วย", short: "ประวัติผู้ป่วย", color: "#2f6fa3", icon: "☺", desc: "ค้นด้วยชื่อหรือเลขบัตร เสียบบัตรเปิดประวัติ ดูข้อมูลสุขภาพบนหุ่น 3D และพิมพ์ใบสรุป" },
  aiplan: { title: "แผนการรักษาโดย AI", short: "แผน AI", color: "#7a5af0", icon: "✦", desc: "ให้ AI ร่างแผนนวด ประคบ สมุนไพร แล้วแพทย์แผนไทยตรวจ อนุมัติ และจองนัดตามแผน" },
  visit: { title: "รับบริการ: เรียกคิวถึงเริ่มนวด", short: "เรียกคิว", color: "#2f8f9a", icon: "◷", desc: "เรียกคิว คัดกรองก่อนนวดทุกครั้ง เลือกเตียง และเริ่มจับเวลา" },
  record: { title: "บันทึกการรักษา", short: "บันทึกการรักษา", color: "#d08a3c", icon: "✎", desc: "บันทึกวินิจฉัย หัตถการ (รหัส ICD อัตโนมัติ) และ Pain Score หลังนวด" },
  payment: { title: "รับชำระเงิน", short: "ชำระเงิน", color: "#c2482b", icon: "฿", desc: "เลือกวิธีชำระ เงินสด พร้อมเพย์ บิลในแอป หรือหักเครดิตคอร์ส แล้วออกใบเสร็จ" },
  billing: { title: "คิดเงินและรายงาน", short: "คิดเงิน", color: "#b0739a", icon: "▤", desc: "ดูยอดรับชำระ ใบเสร็จ ยกเลิก/คืนเงิน และส่งออกรายงานเป็น Excel" },
  settings: { title: "ตั้งค่าและสำรองข้อมูล", short: "ตั้งค่า", color: "#66756b", icon: "⚙", desc: "ข้อมูลคลินิก กฎคัดกรองความปลอดภัย การสำรอง/กู้คืน และคู่มือการใช้งาน" },
};
const ORDER = ["home", "register", "patient", "aiplan", "visit", "record", "payment", "billing", "settings"];

const $ = (s, el = document) => el.querySelector(s);
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const store = {
  get() {
    try {
      return JSON.parse(localStorage.getItem("tw.academy") || "{}");
    } catch {
      return {};
    }
  },
  done(id) {
    const s = this.get();
    s[id] = 1;
    try {
      localStorage.setItem("tw.academy", JSON.stringify(s));
    } catch {}
  },
};

let DATA = {};
let current = null;

fetch("chapters.json")
  .then((r) => r.json())
  .then((d) => {
    DATA = d;
    renderStats();
    renderHeroCards();
    renderToc();
    const want = location.hash.slice(1);
    open(ORDER.includes(want) ? want : ORDER[0], false);
  });

function renderStats() {
  const total = ORDER.reduce((a, id) => a + (DATA[id]?.steps.reduce((t, s) => t + 4 + s.actions.length * 2.6, 0) || 0), 0);
  const steps = ORDER.reduce((a, id) => a + (DATA[id]?.steps.length || 0), 0);
  $("#stats").innerHTML = `
    <div><b>${ORDER.length}</b><small>บทเรียน</small></div>
    <div><b>${steps}</b><small>ขั้นตอน</small></div>
    <div><b>${Math.round(total / 60)}</b><small>นาที</small></div>`;
}

function renderHeroCards() {
  $("#heroCards").innerHTML = ["register", "visit", "aiplan"]
    .map((id, i) => `<img src="${DATA[id]?.poster}" style="--i:${i}" alt="" />`)
    .join("");
}

function renderToc() {
  const seen = store.get();
  $("#toc").innerHTML =
    `<p class="toc__h">บทเรียน</p>` +
    ORDER.map((id, i) => {
      const c = INFO[id];
      return `<button class="toc__item" data-id="${id}" style="--c:${c.color}">
        <span class="toc__no">${seen[id] ? "✓" : i + 1}</span>
        <span class="toc__t"><b>${c.short}</b><small>${DATA[id]?.steps.length || 0} ขั้นตอน</small></span>
      </button>`;
    }).join("");
  $("#toc").querySelectorAll(".toc__item").forEach((b) => b.addEventListener("click", () => open(b.dataset.id)));
}

function open(id, scroll = true) {
  current = id;
  history.replaceState(null, "", "#" + id);
  document.querySelectorAll(".toc__item").forEach((b) => b.classList.toggle("is-on", b.dataset.id === id));
  const c = INFO[id];
  const d = DATA[id];
  const i = ORDER.indexOf(id);
  const prev = ORDER[i - 1];
  const next = ORDER[i + 1];
  const L = $("#lesson");
  L.style.setProperty("--c", c.color);
  L.innerHTML = `
    <div class="lesson__head reveal">
      <span class="lesson__icon">${c.icon}</span>
      <div>
        <small>บทที่ ${i + 1} จาก ${ORDER.length}</small>
        <h2>${c.title}</h2>
        <p>${c.desc}</p>
      </div>
    </div>

    <div class="strip reveal">
      ${d.steps.map((x) => `<button data-jump="${x.n}"><span>${x.n}</span>${x.title}</button>`).join("")}
    </div>

    <div class="flow">
      ${d.steps
        .map(
          (x, k) => `<article class="flow__step reveal${k % 2 ? " is-alt" : ""}" id="s-${x.n}">
          <div class="flow__anim">
            <div class="device">
              <div class="anim" data-k="${k}">
                <div class="anim__cam">
                  <img class="anim__a" src="${x.start}" alt="${x.title}" />
                  <img class="anim__b" alt="" />
                </div>
                <span class="anim__ring"></span>
                <span class="anim__trail"></span>
                <span class="anim__finger"><i></i></span>
                <span class="anim__bubble"></span>
              </div>
              <span class="device__loop"><i></i></span>
            </div>
          </div>
          <div class="flow__text">
            <span class="flow__no">${x.n}</span>
            <small>ขั้นตอนที่ ${x.n} จาก ${d.steps.length}</small>
            <h3>${x.title}</h3>
            <p>${x.detail || ""}</p>
          </div>
        </article>`,
        )
        .join("")}
    </div>

    <nav class="pager reveal">
      ${prev ? `<button class="pager__btn" data-go="${prev}"><small>← บทก่อนหน้า</small><b>${INFO[prev].short}</b></button>` : "<span></span>"}
      ${next ? `<button class="pager__btn is-next" data-go="${next}"><small>บทถัดไป →</small><b>${INFO[next].short}</b></button>` : `<a class="pager__btn is-next" href="../"><small>เรียนครบแล้ว 🎉</small><b>กลับเข้าระบบ</b></a>`}
    </nav>`;
  wireFlow();
  L.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => open(b.dataset.go)));
  L.querySelectorAll("[data-jump]").forEach((b) => b.addEventListener("click", () => $("#s-" + b.dataset.jump).scrollIntoView({ behavior: "smooth", block: "center" })));
  reveal();
  if (scroll) $(".layout").scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ── tap-demo animation engine: still frames + animated finger, looping like a GIF ── */
const sleep = (ms, run) =>
  new Promise((res, rej) => {
    const t = setTimeout(() => (run.alive ? res() : rej(0)), ms);
    run.timers.push(t);
  });
const preload = (src) => new Promise((r) => { const i = new Image(); i.onload = i.onerror = r; i.src = src; });

function makeRunner(el, step) {
  const cam = el.querySelector(".anim__cam");
  let A = el.querySelector(".anim__a");
  let B = el.querySelector(".anim__b");
  const finger = el.querySelector(".anim__finger");
  const ring = el.querySelector(".anim__ring");
  const trail = el.querySelector(".anim__trail");
  const bubble = el.querySelector(".anim__bubble");
  const bar = el.parentElement.querySelector(".device__loop i");
  let run = null;
  const pos = (n, x, y) => { n.style.left = x + "%"; n.style.top = y + "%"; };
  const show = (src, run, ms = 450) => new Promise(async (res) => {
    await preload(src);
    B.src = src;
    B.style.transition = `opacity ${ms}ms ease`;
    B.style.opacity = 1;
    await sleep(ms, run).catch(() => {});
    A.src = src;
    B.style.transition = "none";
    B.style.opacity = 0;
    res();
  });
  const zoom = (a, on) => {
    cam.style.transformOrigin = `${a.x}% ${a.y}%`;
    cam.style.transform = on ? "scale(1.08)" : "scale(1)";
  };
  const ringAt = (a, on) => {
    const w = Math.max(a.w || 6, 5), h = Math.max(a.h || 6, 6);
    ring.style.left = a.x - w / 2 - 0.8 + "%";
    ring.style.top = a.y - h / 2 - 1.2 + "%";
    ring.style.width = w + 1.6 + "%";
    ring.style.height = h + 2.4 + "%";
    ring.classList.toggle("is-on", on);
  };
  async function loop(r) {
    const acts = step.actions;
    const total = 1200 + acts.length * 2600 + 1800;
    for (;;) {
      bar.style.transition = "none"; bar.style.transform = "scaleX(0)"; void bar.offsetWidth;
      bar.style.transition = `transform ${total}ms linear`; bar.style.transform = "scaleX(1)";
      A.src = step.start; B.style.opacity = 0; zoom({ x: 50, y: 50 }, false); ringAt({ x: -50, y: -50 }, false);
      finger.className = "anim__finger"; pos(finger, 50, 112);
      await sleep(900, r);
      for (const a of acts) {
        finger.classList.add("is-on");
        pos(finger, a.x, a.y);
        await sleep(750, r);
        if (a.kind === "point") {
          ringAt(a, true); zoom(a, true);
          await sleep(1300, r);
        } else if (a.kind === "drag") {
          finger.classList.add("is-down");
          trail.style.left = a.x + "%"; trail.style.top = a.y + "%"; trail.style.width = "0%"; trail.classList.add("is-on");
          await sleep(150, r);
          finger.style.transition = "left .9s cubic-bezier(.45,0,.2,1), top .9s cubic-bezier(.45,0,.2,1)";
          trail.style.width = Math.abs(a.x2 - a.x) + "%";
          pos(finger, a.x2, a.y2);
          await sleep(950, r);
          finger.style.transition = ""; finger.classList.remove("is-down"); trail.classList.remove("is-on");
        } else if (a.kind === "scroll") {
          finger.classList.add("is-down");
          finger.style.transition = "top .8s cubic-bezier(.45,0,.2,1)";
          pos(finger, a.x, a.y - 18);
          await sleep(850, r);
          finger.style.transition = ""; finger.classList.remove("is-down");
        } else {
          ringAt(a, true); zoom(a, true);
          finger.classList.add("is-down");
          ripple(el, a);
          if (a.kind === "hold") { finger.classList.add("is-hold"); await sleep(900, r); finger.classList.remove("is-hold"); }
          else await sleep(180, r);
          finger.classList.remove("is-down");
          if (a.kind === "type") {
            bubble.style.left = a.x + "%"; bubble.style.top = a.y + "%"; bubble.textContent = ""; bubble.classList.add("is-on");
            for (const ch of a.text) { bubble.textContent += ch; await sleep(70, r); }
            await sleep(400, r);
            bubble.classList.remove("is-on");
          } else await sleep(350, r);
        }
        await show(a.frame, r);
        zoom(a, false); ringAt(a, false);
        await sleep(700, r);
      }
      finger.classList.remove("is-on");
      await sleep(1800, r);
    }
  }
  return {
    start() {
      if (run) return;
      run = { alive: true, timers: [] };
      el.closest(".flow__step")?.classList.add("is-live");
      // warm the frames, then play
      Promise.all([step.start, ...step.actions.map((a) => a.frame)].map(preload)).then(() => run && loop(run).catch(() => {}));
    },
    stop() {
      if (!run) return;
      run.alive = false; run.timers.forEach(clearTimeout); run = null;
      el.closest(".flow__step")?.classList.remove("is-live");
    },
  };
}
function ripple(el, a) {
  const r = document.createElement("span");
  r.className = "anim__ripple";
  r.style.left = a.x + "%"; r.style.top = a.y + "%";
  el.appendChild(r);
  setTimeout(() => r.remove(), 800);
}

const runners = new Map();
const vio = new IntersectionObserver(
  (es) => es.forEach((e) => { const r = runners.get(e.target); if (r) e.isIntersecting ? r.start() : r.stop(); }),
  { threshold: 0.35 },
);
function wireFlow() {
  runners.forEach((r, el) => (r.stop(), vio.unobserve(el)));
  runners.clear();
  const d = DATA[current];
  document.querySelectorAll(".flow .anim").forEach((el) => {
    const r = makeRunner(el, d.steps[+el.dataset.k]);
    runners.set(el, r);
    vio.observe(el);
  });
  const last = document.querySelector(".flow__step:last-child");
  if (last) {
    const done = new IntersectionObserver((es) => {
      if (es[0].isIntersecting) {
        store.done(current);
        const on = current;
        renderToc();
        document.querySelector(`.toc__item[data-id="${on}"]`)?.classList.add("is-on");
        done.disconnect();
      }
    });
    done.observe(last);
  }
}

function lightbox(src, cap) {
  const lb = $("#lightbox");
  $("img", lb).src = src;
  $("p", lb).textContent = cap;
  lb.hidden = false;
  requestAnimationFrame(() => lb.classList.add("is-open"));
}
$("#lightbox").addEventListener("click", () => {
  const lb = $("#lightbox");
  lb.classList.remove("is-open");
  setTimeout(() => (lb.hidden = true), 250);
});
addEventListener("keydown", (e) => e.key === "Escape" && !$("#lightbox").hidden && $("#lightbox").click());
$("#start").addEventListener("click", () => open(ORDER[0]));

const io = new IntersectionObserver(
  (es) =>
    es.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("is-in");
        io.unobserve(e.target);
      }
    }),
  { threshold: 0.12 },
);
function reveal() {
  document.querySelectorAll(".reveal:not(.is-in)").forEach((el, i) => {
    el.style.setProperty("--d", `${Math.min(i, 8) * 60}ms`);
    io.observe(el);
  });
}
