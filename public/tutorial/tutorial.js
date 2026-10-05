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
  const total = ORDER.reduce((a, id) => a + (DATA[id]?.duration || 0), 0);
  const steps = ORDER.reduce((a, id) => a + (DATA[id]?.steps.length || 0), 0);
  $("#stats").innerHTML = `
    <div><b>${ORDER.length}</b><small>บทเรียน</small></div>
    <div><b>${steps}</b><small>ขั้นตอน</small></div>
    <div><b>${Math.round(total / 60)}</b><small>นาที</small></div>`;
}

function renderHeroCards() {
  $("#heroCards").innerHTML = ["register", "visit", "aiplan"]
    .map((id, i) => `<video src="${DATA[id]?.steps[1]?.clip}" poster="${DATA[id]?.poster}" style="--i:${i}" muted loop playsinline autoplay></video>`)
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
              <video src="${x.clip}" poster="${x.shot}" muted loop playsinline preload="none" aria-label="${x.title}"></video>
              <span class="device__loop"><i style="animation-duration:${x.len}s"></i></span>
            </div>
            <button class="flow__zoom" data-src="${x.shot}" data-cap="${x.n}. ${x.title}" aria-label="ขยายภาพ">⤢</button>
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
  L.querySelectorAll(".flow__zoom").forEach((b) => b.addEventListener("click", () => lightbox(b.dataset.src, b.dataset.cap)));
  L.querySelectorAll("[data-jump]").forEach((b) => b.addEventListener("click", () => $("#s-" + b.dataset.jump).scrollIntoView({ behavior: "smooth", block: "center" })));
  reveal();
  if (scroll) $(".layout").scrollIntoView({ behavior: "smooth", block: "start" });
}

/* each step loops like a GIF while it is on screen; off-screen clips pause to save battery */
const vio = new IntersectionObserver(
  (es) =>
    es.forEach((e) => {
      const v = e.target;
      if (e.isIntersecting) {
        v.preload = "auto";
        v.play().catch(() => {});
        v.closest(".flow__step")?.classList.add("is-live");
      } else {
        v.pause();
        v.closest(".flow__step")?.classList.remove("is-live");
      }
    }),
  { threshold: 0.35 },
);
function wireFlow() {
  document.querySelectorAll(".flow video").forEach((v) => {
    v.addEventListener("ended", () => ((v.currentTime = 0), v.play()));
    v.addEventListener("playing", () => {
      const i = v.parentElement.querySelector(".device__loop i");
      if (i) {
        i.style.animationName = "none";
        void i.offsetWidth;
        i.style.animationName = "";
      }
    });
    vio.observe(v);
  });
  // mark the chapter as learnt once the last step has been seen
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
