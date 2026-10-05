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
        <span class="toc__t"><b>${c.short}</b><small>${fmt(DATA[id]?.duration || 0)} · ${DATA[id]?.steps.length || 0} ขั้นตอน</small></span>
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

    <div class="stage reveal">
      <div class="player">
        <video id="vid" src="${d.video}" poster="${d.poster}" playsinline preload="metadata" muted></video>
        <button class="player__big" aria-label="เล่นวิดีโอ"><span>▶</span></button>
        <div class="player__caption" id="cap"></div>
        <div class="player__bar">
          <button class="player__pp" aria-label="เล่น/หยุด">▶</button>
          <div class="player__track" id="track">
            <div class="player__fill" id="fill"></div>
            ${d.steps.map((s) => `<i style="left:${(s.t / d.duration) * 100}%" title="${s.title}"></i>`).join("")}
          </div>
          <span class="player__time" id="time">0:00 / ${fmt(d.duration)}</span>
          <button class="player__speed" id="speed" aria-label="ความเร็ว">1×</button>
          <button class="player__fs" id="fs" aria-label="เต็มจอ">⤢</button>
        </div>
      </div>
      <ol class="steps" id="steps">
        ${d.steps
          .map(
            (s) => `<li data-t="${s.t}">
            <span class="steps__no">${s.n}</span>
            <div><b>${s.title}</b><small>${s.detail || ""}</small></div>
            <span class="steps__t">${fmt(s.t)}</span>
            <span class="steps__bar"></span>
          </li>`,
          )
          .join("")}
      </ol>
    </div>

    <h3 class="sec-h reveal">ภาพหน้าจอทีละขั้นตอน</h3>
    <div class="shots">
      ${d.steps
        .map(
          (s) => `<figure class="shot reveal" data-t="${s.t}">
          <button class="shot__img" data-src="${s.shot}" data-cap="${s.n}. ${s.title}">
            <img src="${s.shot}" alt="${s.title}" loading="lazy" />
            <span class="shot__play">▶ ดูในวิดีโอ ${fmt(s.t)}</span>
          </button>
          <figcaption><span>${s.n}</span><div><b>${s.title}</b><small>${s.detail || ""}</small></div></figcaption>
        </figure>`,
        )
        .join("")}
    </div>

    <nav class="pager reveal">
      ${prev ? `<button class="pager__btn" data-go="${prev}"><small>← บทก่อนหน้า</small><b>${INFO[prev].short}</b></button>` : "<span></span>"}
      ${next ? `<button class="pager__btn is-next" data-go="${next}"><small>บทถัดไป →</small><b>${INFO[next].short}</b></button>` : `<a class="pager__btn is-next" href="../"><small>เรียนครบแล้ว 🎉</small><b>กลับเข้าระบบ</b></a>`}
    </nav>`;
  wirePlayer(d, id);
  L.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => open(b.dataset.go)));
  L.querySelectorAll(".shot__img").forEach((b) =>
    b.addEventListener("click", (e) => {
      if (e.target.closest(".shot__play")) {
        seek(+b.closest(".shot").dataset.t);
        $(".stage").scrollIntoView({ behavior: "smooth", block: "start" });
      } else lightbox(b.dataset.src, b.dataset.cap);
    }),
  );
  reveal();
  if (scroll) $(".layout").scrollIntoView({ behavior: "smooth", block: "start" });
}

let seek = () => {};
function wirePlayer(d, id) {
  const v = $("#vid");
  const steps = [...document.querySelectorAll("#steps li")];
  const player = $(".player");
  const play = () => v.play();
  const toggle = () => (v.paused ? v.play() : v.pause());
  seek = (t) => {
    v.currentTime = Math.max(0, t - 0.1);
    v.play();
  };
  $(".player__big").addEventListener("click", play);
  $(".player__pp").addEventListener("click", toggle);
  v.addEventListener("click", toggle);
  v.addEventListener("play", () => player.classList.add("is-playing"));
  v.addEventListener("pause", () => player.classList.remove("is-playing"));
  v.addEventListener("ended", () => {
    store.done(id);
    renderToc();
    document.querySelector(`.toc__item[data-id="${id}"]`)?.classList.add("is-on");
  });
  const speeds = [1, 1.5, 2, 0.75];
  $("#speed").addEventListener("click", (e) => {
    const n = speeds[(speeds.indexOf(v.playbackRate) + 1) % speeds.length];
    v.playbackRate = n;
    e.currentTarget.textContent = n + "×";
  });
  $("#fs").addEventListener("click", () => (player.requestFullscreen ? player.requestFullscreen() : v.webkitEnterFullscreen?.()));
  const track = $("#track");
  const scrub = (e) => {
    const r = track.getBoundingClientRect();
    v.currentTime = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * (v.duration || d.duration);
  };
  track.addEventListener("pointerdown", (e) => {
    scrub(e);
    const mv = (ev) => scrub(ev);
    const up = () => (removeEventListener("pointermove", mv), removeEventListener("pointerup", up));
    addEventListener("pointermove", mv);
    addEventListener("pointerup", up);
  });
  steps.forEach((li) => li.addEventListener("click", () => seek(+li.dataset.t)));
  v.addEventListener("timeupdate", () => {
    const t = v.currentTime;
    const dur = v.duration || d.duration;
    $("#fill").style.width = (t / dur) * 100 + "%";
    $("#time").textContent = `${fmt(t)} / ${fmt(dur)}`;
    let k = -1;
    d.steps.forEach((s, i) => t + 0.05 >= s.t && (k = i));
    steps.forEach((li, i) => {
      li.classList.toggle("is-on", i === k);
      li.classList.toggle("is-done", i < k);
      if (i === k) {
        const end = d.steps[i + 1]?.t ?? dur;
        li.style.setProperty("--p", Math.min(1, (t - d.steps[i].t) / (end - d.steps[i].t)));
      }
    });
    const cap = $("#cap");
    if (k >= 0 && cap.dataset.k !== String(k)) {
      cap.dataset.k = String(k);
      cap.innerHTML = `<span>${d.steps[k].n}</span>${d.steps[k].title}`;
      cap.classList.remove("is-in");
      void cap.offsetWidth;
      cap.classList.add("is-in");
      const on = steps[k];
      if (on && matchMedia("(min-width: 980px)").matches) on.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  });
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
$("#start").addEventListener("click", () => {
  open(ORDER[0]);
  setTimeout(() => $("#vid")?.play(), 500);
});

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
