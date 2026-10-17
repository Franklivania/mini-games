// Spin the Wheel — enter names, spin, and the pointer picks one at random.
import { PALETTE, INK, CREAM, SAND } from "./lib/palette.js";
import { randomInt, shuffle } from "./lib/random.js";
import { loadJSON, saveJSON } from "./lib/storage.js";
import { sound } from "./lib/sound.js";
import { confetti } from "./lib/confetti.js";
/* ---------- Config ---------- */
const SPIN_MS = 5600;
const STORAGE_KEY = "spinny.names.v1";
const DEFAULT_NAMES = ["Ada", "Chidi", "Kwame", "Zainab", "Tobi", "Amara"];

/* ---------- DOM ---------- */
const $ = (id) => document.getElementById(id);
const canvas = $("wheel");
const ctx = canvas.getContext("2d");
const form = $("addForm");
const input = $("nameInput");
const list = $("nameList");
const count = $("count");
const emptyMsg = $("emptyMsg");
const spinBtn = $("spinBtn");
const pointer = $("pointer");
const shuffleBtn = $("shuffleBtn");
const clearBtn = $("clearBtn");
const removeWinnerToggle = $("removeWinner");
const winnerEl = $("winner");
const winnerName = $("winnerName");
const historyEl = $("history");
const historyList = $("historyList");

/* ---------- State ---------- */
let names = load();
let rotation = 0;          // radians, current wheel rotation
let spinning = false;
let lastWinnerIndex = -1;
let lightsPhase = 0;
const history = [];

/* ---------- Storage ---------- */
function load() {
  const parsed = loadJSON(STORAGE_KEY, null);
  return Array.isArray(parsed) ? parsed.filter((n) => typeof n === "string" && n.trim()) : DEFAULT_NAMES.slice();
}
const save = () => saveJSON(STORAGE_KEY, names);

/* ---------- Colours: never two of the same next to each other ---------- */
function segmentColors(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    let c = PALETTE[i % PALETTE.length];
    if (i === n - 1 && n > 1 && c === out[0]) {
      c = PALETTE.find((p) => p !== out[0] && p !== out[i - 1]);
    }
    out.push(c);
  }
  return out;
}

/* ---------- Drawing ---------- */
const SIZE = canvas.width;
const C = SIZE / 2;
const R_OUTER = C - 6;     // black rim edge
const R_RIM_IN = C - 62;   // inner edge of rim band
const R_SEG = R_RIM_IN - 6;

function draw() {
  ctx.clearRect(0, 0, SIZE, SIZE);

  // Rim band
  ctx.beginPath();
  ctx.arc(C, C, R_OUTER, 0, Math.PI * 2);
  ctx.fillStyle = INK;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(C, C, R_OUTER - 10, 0, Math.PI * 2);
  ctx.fillStyle = PALETTE[2];
  ctx.fill();

  ctx.beginPath();
  ctx.arc(C, C, R_RIM_IN, 0, Math.PI * 2);
  ctx.fillStyle = INK;
  ctx.fill();

  // Segments
  ctx.save();
  ctx.translate(C, C);
  ctx.rotate(rotation);

  const n = names.length;
  if (n === 0) {
    drawPlaceholder();
  } else {
    const seg = (Math.PI * 2) / n;
    const colors = segmentColors(n);
    for (let i = 0; i < n; i++) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, R_SEG, i * seg, (i + 1) * seg);
      ctx.closePath();
      ctx.fillStyle = colors[i];
      ctx.fill();
      if (n > 1) {
        ctx.lineWidth = 5;
        ctx.strokeStyle = INK;
        ctx.stroke();
      }
    }
    drawLabels(seg);
  }
  ctx.restore();

  drawBulbs();
}

function drawPlaceholder() {
  const k = 16, seg = (Math.PI * 2) / k;
  for (let i = 0; i < k; i++) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, R_SEG, i * seg, (i + 1) * seg);
    ctx.closePath();
    ctx.fillStyle = i % 2 ? CREAM : SAND;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(17,17,17,.25)";
    ctx.stroke();
  }
}

function drawLabels(seg) {
  const n = names.length;
  const fontSize = Math.max(20, Math.min(54, Math.floor(520 / Math.max(n, 4)) + 14));
  const maxWidth = R_SEG - 150; // stay clear of the hub
  ctx.font = `400 ${fontSize}px Anton, Impact, sans-serif`;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillStyle = INK;

  for (let i = 0; i < n; i++) {
    ctx.save();
    ctx.rotate(i * seg + seg / 2);
    ctx.fillText(fit(names[i].toUpperCase(), maxWidth), R_SEG - 30, 2);
    ctx.restore();
  }
}

function fit(text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > max) t = t.slice(0, -1);
  return t + "…";
}

function drawBulbs() {
  const k = 20;
  const r = (R_OUTER - 10 + R_RIM_IN) / 2;
  for (let i = 0; i < k; i++) {
    const a = (i / k) * Math.PI * 2 - Math.PI / 2;
    const on = spinning ? (i + lightsPhase) % 2 === 0 : i % 2 === 0;
    ctx.beginPath();
    ctx.arc(C + Math.cos(a) * r, C + Math.sin(a) * r, 12, 0, Math.PI * 2);
    ctx.fillStyle = on ? PALETTE[0] : CREAM;
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }
}

/* ---------- Which segment is under the pointer (top, -90°) ---------- */
function indexAtPointer(rot) {
  const n = names.length;
  if (!n) return -1;
  const seg = (Math.PI * 2) / n;
  let a = (-Math.PI / 2 - rot) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return Math.floor(a / seg) % n;
}

/* ---------- Spin ---------- */
const easeOut = (t) => 1 - Math.pow(1 - t, 4);

function spin() {
  if (spinning || names.length < 2) return;
  closeWinner();
  spinning = true;
  updateUI();

  const n = names.length;
  const seg = (Math.PI * 2) / n;
  const pick = randomInt(n);
  // land somewhere inside the picked slice, never on a line
  const offset = (0.12 + (randomInt(1000) / 1000) * 0.76) * seg;
  const targetLocal = pick * seg + offset;

  const start = rotation;
  let end = -Math.PI / 2 - targetLocal;
  const minTravel = Math.PI * 2 * (6 + randomInt(3));
  while (end < start + minTravel) end += Math.PI * 2;

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const duration = reduce ? 600 : SPIN_MS;
  const t0 = performance.now();
  let lastIdx = indexAtPointer(start);
  let lastLight = 0;

  function frame(now) {
    const t = Math.min(1, (now - t0) / duration);
    rotation = start + (end - start) * easeOut(t);

    const idx = indexAtPointer(rotation);
    if (idx !== lastIdx) {
      lastIdx = idx;
      sound.tick();
      pointer.classList.remove("is-flicking");
      void pointer.offsetWidth;
      pointer.classList.add("is-flicking");
    }
    if (now - lastLight > 140) { lightsPhase ^= 1; lastLight = now; }

    draw();
    if (t < 1) requestAnimationFrame(frame);
    else finish(pick);
  }
  requestAnimationFrame(frame);
}

function finish(idx) {
  rotation %= Math.PI * 2;
  spinning = false;
  lastWinnerIndex = idx;
  const name = names[idx];
  history.unshift(name);
  renderHistory();
  draw();
  updateUI();
  sound.fanfare();
  confetti($("confetti"));

  if (removeWinnerToggle.checked) {
    names.splice(idx, 1);
    lastWinnerIndex = -1;
    save();
    render();
  }
  showWinner(name);
}

/* ---------- Winner dialog ---------- */
function showWinner(name) {
  winnerName.textContent = name;
  $("removeBtn").hidden = removeWinnerToggle.checked;
  winnerEl.hidden = false;
  $("againBtn").focus();
}
function closeWinner() { winnerEl.hidden = true; }

$("againBtn").addEventListener("click", () => { closeWinner(); spin(); });
$("closeBtn").addEventListener("click", closeWinner);
$("removeBtn").addEventListener("click", () => {
  if (lastWinnerIndex > -1) removeAt(lastWinnerIndex);
  closeWinner();
});
winnerEl.addEventListener("click", (e) => { if (e.target === winnerEl) closeWinner(); });

/* ---------- Names ---------- */
function addMany(raw) {
  const incoming = raw.split(/[\n,;]+/).map((s) => s.trim().slice(0, 40)).filter(Boolean);
  if (!incoming.length) return;
  names.push(...incoming);
  lastWinnerIndex = -1;
  save();
  render();
}
function removeAt(i) {
  names.splice(i, 1);
  lastWinnerIndex = -1;
  save();
  render();
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (spinning) return;
  addMany(input.value);
  input.value = "";
  input.focus();
});
input.addEventListener("paste", (e) => {
  const text = (e.clipboardData || window.clipboardData).getData("text");
  if (/[\n,;]/.test(text) && !spinning) {
    e.preventDefault();
    addMany(text);
  }
});

list.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-i]");
  if (btn && !spinning) removeAt(Number(btn.dataset.i));
});

shuffleBtn.addEventListener("click", () => {
  shuffle(names);
  lastWinnerIndex = -1;
  save();
  render();
});
clearBtn.addEventListener("click", () => {
  if (!names.length) return;
  if (!confirm("Clear every name from the wheel?")) return;
  names = [];
  lastWinnerIndex = -1;
  save();
  render();
});

spinBtn.addEventListener("click", spin);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeWinner();
  if (e.code === "Space" && document.activeElement !== input && !e.target.closest("button")) {
    e.preventDefault();
    spin();
  }
});

/* ---------- Render ---------- */
function render() {
  const colors = segmentColors(names.length);
  list.innerHTML = "";
  names.forEach((name, i) => {
    const li = document.createElement("li");
    li.className = "chip" + (i === lastWinnerIndex ? " is-winner" : "");
    li.style.background = colors[i];
    const span = document.createElement("span");
    span.textContent = name;
    span.title = name;
    const x = document.createElement("button");
    x.type = "button";
    x.dataset.i = i;
    x.setAttribute("aria-label", `Remove ${name}`);
    x.textContent = "×";
    li.append(span, x);
    list.append(li);
  });
  count.textContent = names.length;
  emptyMsg.hidden = names.length > 0;
  emptyMsg.textContent = names.length === 1 ? "One more name and you're good to spin." : "No names yet. Add at least two to spin.";
  if (names.length === 1) emptyMsg.hidden = false;
  updateUI();
  draw();
}

function renderHistory() {
  historyEl.hidden = history.length === 0;
  historyList.innerHTML = "";
  history.slice(0, 10).forEach((n) => {
    const li = document.createElement("li");
    li.textContent = n;
    historyList.append(li);
  });
}

function updateUI() {
  spinBtn.disabled = spinning || names.length < 2;
  shuffleBtn.disabled = spinning || names.length < 2;
  clearBtn.disabled = spinning || names.length === 0;
  input.disabled = spinning;
  canvas.setAttribute("aria-label", names.length ? `Wheel with ${names.length} names` : "Empty wheel");
}

/* ---------- Boot ---------- */
render();
// redraw once the display font arrives so labels use Anton
if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
