const MAX_CHANGES = 2;
const MAX_LEN = 12;
const $ = (id) => document.getElementById(id);

/* ---------- storage (never throws) ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

/* ---------- word logic ---------- */
// Edit distance from `a` to `b`, plus which letters of `b` were swapped or added.
function diff(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  const marks = Array(n).fill(false);
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1] && d[i][j] === d[i - 1][j - 1]) { i--; j--; }
    else if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + 1) { marks[j - 1] = true; i--; j--; }
    else if (j > 0 && d[i][j] === d[i][j - 1] + 1) { marks[j - 1] = true; j--; }
    else i--;
  }
  return { dist: d[m][n], marks };
}

/* ---------- puzzle of the day ---------- */
function dayIndex(epoch, now = new Date()) {
  const [y, m, d] = epoch.split("-").map(Number);
  return Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(y, m - 1, d)) / 864e5);
}

const verdicts = (delta) =>
  delta <= -2 ? ["Eagle!", "🦅"] :
  delta === -1 ? ["Birdie!", "🐦"] :
  delta === 0 ? ["Par!", "⛳"] :
  delta === 1 ? ["Bogey", "🙂"] :
  delta === 2 ? ["Double bogey", "😅"] : ["Made it", "🏁"];

/* ---------- state ---------- */
let words = null;
let puzzle, number, path, typed = "", done = false;

const wordsReady = fetch("/words.txt")
  .then((r) => r.text())
  .then((t) => { words = new Set(t.split("\n")); });

async function init() {
  const data = await fetch("/puzzles.json").then((r) => r.json());
  const idx = Math.max(0, dayIndex(data.epoch));
  puzzle = data.puzzles[idx % data.puzzles.length];
  number = idx + 1;
  const saved = store.get("jumple:game:" + number, null);
  path = saved?.path?.[0] === puzzle.start ? saved.path : [puzzle.start];
  done = path.at(-1) === puzzle.end;

  const date = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" });
  $("meta").textContent = `No. ${number} · ${date}`;
  $("par").textContent = `Par ${puzzle.par}`;
  renderTiles($("start"), puzzle.start);
  renderTiles($("goal"), puzzle.end);
  buildKeyboard();
  renderHops();
  renderInput();
  if (done) finish(false);
  else if (!store.get("jumple:seen-help", false)) { openSheet("help"); store.set("jumple:seen-help", true); }
}

/* ---------- rendering ---------- */
function renderTiles(el, word, marks = []) {
  el.style.setProperty("--n", Math.max(word.length, 1));
  el.innerHTML = [...word].map((c, i) => `<div class="tile${marks[i] ? " changed" : ""}">${c}</div>`).join("");
}

function dots(n, total = MAX_CHANGES) {
  return `<span class="dots">${Array.from({ length: Math.max(total, n) }, (_, i) => `<i class="${i < n ? "on" : ""}"></i>`).join("")}</span>`;
}

function renderHops(animateLast = false) {
  const ol = $("hops");
  ol.innerHTML = "";
  // the last hop of a solved game is shown in the goal row instead
  const last = done ? path.length - 1 : path.length;
  for (let i = 1; i < last; i++) {
    const { dist, marks } = diff(path[i - 1], path[i]);
    const li = document.createElement("li");
    if (animateLast && i === last - 1) li.className = "new";
    li.innerHTML = `<div class="tiles"></div><div class="hop-meta">Hop ${i} ${dots(dist)}</div>`;
    renderTiles(li.firstChild, path[i], marks);
    ol.appendChild(li);
  }
  $("undo-btn").disabled = done || path.length < 2;
  $("goal").classList.toggle("solved", done);
  $("input-wrap").classList.toggle("done", done);
  $("result-btn").classList.toggle("hidden", !done);
  $("undo-btn").classList.toggle("hidden", done);
  $("input-label").textContent = `Hop ${path.length}`;
}

function renderInput() {
  const el = $("input");
  const prev = path.at(-1);
  const { dist, marks } = typed ? diff(prev, typed) : { dist: 0, marks: [] };
  const n = Math.max(typed.length + 1, prev.length);
  el.style.setProperty("--n", Math.min(n, MAX_LEN));
  let html = "";
  for (let i = 0; i < Math.min(n, MAX_LEN); i++) {
    const c = typed[i];
    const cls = c ? "filled" + (marks[i] ? " changed" : "") : i === typed.length ? "cursor" : "";
    html += `<div class="tile ${cls}">${c || ""}</div>`;
  }
  el.innerHTML = html;
  const counter = $("counter");
  counter.classList.toggle("over", dist > MAX_CHANGES);
  counter.innerHTML = typed
    ? `${dots(dist)} ${dist === 0 ? "No changes yet" : `${dist} change${dist > 1 ? "s" : ""}`}`
    : `${dots(0)} Type a word`;
  // dist also counts removed letters, which don't show as tiles
}

/* ---------- input ---------- */
function press(key) {
  if (done) return;
  if (key === "enter") return submit();
  if (key === "back") typed = typed.slice(0, -1);
  else if (/^[a-z]$/.test(key) && typed.length < MAX_LEN) typed += key;
  else return;
  renderInput();
  $("input").classList.add("typing");
}

async function submit() {
  const prev = path.at(-1);
  if (!typed) return toast("Type a word");
  if (!words) { toast("Loading words…"); await wordsReady; }
  const { dist } = diff(prev, typed);
  if (dist === 0) return reject("Change at least one letter");
  if (dist > MAX_CHANGES) return reject(`That's ${dist} changes — ${MAX_CHANGES} max`);
  if (!words.has(typed)) return reject("Not in the word list");
  if (path.includes(typed)) return reject("Already used that word");
  path.push(typed);
  typed = "";
  done = path.at(-1) === puzzle.end;
  save();
  renderHops(true);
  renderInput();
  $("board").scrollTo({ top: $("board").scrollHeight, behavior: "smooth" });
  if (done) finish(true);
}

function undo() {
  if (done || path.length < 2) return;
  typed = "";
  path.pop();
  save();
  renderHops();
  renderInput();
}

function reject(msg) {
  toast(msg);
  const el = $("input");
  el.classList.remove("shake");
  void el.offsetWidth;
  el.classList.add("shake");
}

let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 1600);
}

function buildKeyboard() {
  const goal = new Set(puzzle.end);
  const rows = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
  $("keyboard").innerHTML = rows
    .map((r, i) => {
      let keys = [...r].map((c) => `<button class="key${goal.has(c) ? " goal-letter" : ""}" data-key="${c}" aria-label="${c}">${c}</button>`).join("");
      if (i === 1) keys = `<span class="kb-spacer"></span>${keys}<span class="kb-spacer"></span>`;
      if (i === 2)
        keys = `<button class="key wide enter" data-key="enter">Enter</button>${keys}<button class="key wide" data-key="back" aria-label="Delete"><svg viewBox="0 0 24 24"><path d="M9 5h10.5A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5H9l-6-7z"/><path d="m12 9.5 5 5m0-5-5 5"/></svg></button>`;
      return `<div class="kb-row">${keys}</div>`;
    })
    .join("");
}

document.addEventListener("click", (e) => {
  const k = e.target.closest("[data-key]");
  if (k) { press(k.dataset.key); k.blur(); }
});
document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector("dialog[open]")) return;
  if (e.key === "Enter") { e.preventDefault(); press("enter"); }
  else if (e.key === "Backspace") press("back");
  else if (e.key.length === 1) press(e.key.toLowerCase());
});
$("undo-btn").onclick = undo;
$("result-btn").onclick = () => openSheet("result");
$("help-btn").onclick = () => openSheet("help");
$("stats-btn").onclick = () => { renderStats(); openSheet("stats"); };

/* ---------- sheets ---------- */
function openSheet(id) {
  document.querySelectorAll("dialog[open]").forEach((d) => d.close());
  $(id).showModal();
}
document.querySelectorAll("dialog").forEach((d) => {
  d.addEventListener("click", (e) => {
    if (e.target === d || e.target.closest(".close, [data-close]")) d.close();
  });
});

// "How to play" demo tiles
document.querySelectorAll("#help [data-word]").forEach((el) => {
  const w = el.dataset.word;
  renderTiles(el, w, el.dataset.from ? diff(el.dataset.from, w).marks : []);
  if (el.dataset.removed) el.children[+el.dataset.removed].classList.add("removed");
});

/* ---------- results, stats, sharing ---------- */
function save() {
  store.set("jumple:game:" + number, { path });
  if (path.at(-1) === puzzle.end) {
    const h = store.get("jumple:history", {});
    if (!h[number]) { h[number] = { hops: path.length - 1, par: puzzle.par }; store.set("jumple:history", h); }
  }
}

function finish(fresh) {
  const hops = path.length - 1;
  const [word, emoji] = verdicts(hops - puzzle.par);
  $("r-kicker").textContent = `Jumple No. ${number}`;
  $("r-verdict").textContent = `${word} ${emoji}`;
  $("r-score").textContent = `${hops} hop${hops > 1 ? "s" : ""} · par ${puzzle.par}`;
  $("r-path").innerHTML = path
    .map((w, i) => `<span class="w${i === 0 ? " first" : i === path.length - 1 ? " last" : ""}">${w}</span>`)
    .join('<span class="arrow">→</span>');
  const min = puzzle.min ?? puzzle.par;
  $("r-best").innerHTML =
    hops > min ? `Shortest route, ${min} hops: <b>${puzzle.route.join(" → ")}</b>`
    : hops < min ? `You beat our shortest route of ${min} hops!`
    : `You found the shortest possible route.`;
  tickCountdown();
  // build the image now: iOS only allows sharing straight from the tap, with no slow work first
  makeCard().then((f) => (cardFile = f)).catch(() => {});
  setTimeout(() => openSheet("result"), fresh ? 1100 : 250);
}

function shareText() {
  const hops = path.length - 1;
  const [, emoji] = verdicts(hops - puzzle.par);
  const rows = path.slice(1).map((w, i) => {
    const n = diff(path[i], w).dist;
    return "🟧".repeat(n) + "⬜".repeat(MAX_CHANGES - n);
  });
  return [
    `Jumple No. ${number} · ${hops}/${puzzle.par} ${emoji}`,
    `${puzzle.start.toUpperCase()} → ${puzzle.end.toUpperCase()}`,
    ...rows,
    location.origin, // keep https:// so messaging apps turn it into a link
  ].join("\n");
}

// Result card image for sharing. It shows the shape of each hop but not the hidden words.
async function makeCard() {
  await document.fonts.ready;
  const css = getComputedStyle(document.documentElement);
  const v = (k) => css.getPropertyValue(k).trim();
  const font = getComputedStyle(document.body).fontFamily;
  const serif = v("--serif");
  const S = 1080, c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
  g.fillStyle = v("--bg"); g.fillRect(0, 0, S, S);

  const hops = path.length - 1;
  const [word, emoji] = verdicts(hops - puzzle.par);
  g.textBaseline = "alphabetic";
  g.fillStyle = v("--ink"); g.font = `italic 600 60px ${serif}`;
  g.fillText("jumple", 80, 130);
  const bw = g.measureText("jumple").width;
  g.fillStyle = v("--accent"); g.beginPath(); g.arc(80 + bw + 14, 122, 8, 0, 7); g.fill();
  g.fillStyle = v("--muted"); g.font = `600 34px ${font}`; g.textAlign = "right";
  g.fillText(`No. ${number}`, S - 80, 128); g.textAlign = "left";
  g.fillStyle = v("--ink"); g.font = `italic 600 136px ${serif}`;
  g.fillText(`${word} ${emoji}`, 74, 300);
  g.fillStyle = v("--muted"); g.font = `600 42px ${font}`;
  g.fillText(`${hops} hop${hops > 1 ? "s" : ""} · par ${puzzle.par}`, 80, 370);

  // the ladder: start word, hidden hops, goal word
  const rows = path.map((w, i) => ({ w, marks: i ? diff(path[i - 1], w).marks : [], i }));
  const top = 430, bottom = S - 130, gap = 14;
  const maxLen = Math.max(...path.map((w) => w.length));
  const t = Math.min(118, (S - 160 - gap * (maxLen - 1)) / maxLen, (bottom - top - gap * (rows.length - 1)) / rows.length);
  const y0 = top + (bottom - top - (rows.length * t + (rows.length - 1) * gap)) / 2;
  rows.forEach(({ w, marks, i }, r) => {
    const y = y0 + r * (t + gap);
    const x0 = (S - (w.length * t + (w.length - 1) * gap)) / 2;
    const first = i === 0, last = i === path.length - 1;
    [...w].forEach((ch, k) => {
      const x = x0 + k * (t + gap);
      rr(x, y, t, t, t * 0.1);
      g.fillStyle = first ? v("--ink") : last ? v("--goal") : marks[k] ? v("--accent") : v("--tile");
      g.fill();
      if (!first && !last && !marks[k]) { g.strokeStyle = v("--line"); g.lineWidth = 3; g.stroke(); }
      if (first || last) {
        g.fillStyle = v("--bg"); g.font = `700 ${t * 0.52}px ${font}`; g.textAlign = "center";
        g.fillText(ch.toUpperCase(), x + t / 2, y + t * 0.69); g.textAlign = "left";
      }
    });
  });
  g.fillStyle = v("--muted"); g.font = `600 32px ${font}`; g.textAlign = "center";
  g.fillText(location.host, S / 2, S - 70);
  const blob = await new Promise((r) => c.toBlob(r, "image/png"));
  return new File([blob], `jumple-${number}.png`, { type: "image/png" });
}
let cardFile = null;

$("share-btn").onclick = async () => {
  const text = shareText();
  const btn = $("share-btn");
  try {
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      if (cardFile && navigator.canShare?.({ files: [cardFile] })) await navigator.share({ files: [cardFile], text });
      else await navigator.share({ text });
      return;
    }
  } catch (e) { if (e.name === "AbortError") return; }
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = Object.assign(document.createElement("textarea"), { value: text });
    document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
  }
  const label = btn.lastChild.textContent;
  btn.classList.add("copied");
  btn.lastChild.textContent = " Copied to clipboard";
  setTimeout(() => { btn.classList.remove("copied"); btn.lastChild.textContent = label; }, 1800);
};

function tickCountdown() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const s = Math.max(0, Math.floor((next - now) / 1000));
  const pad = (x) => String(x).padStart(2, "0");
  $("countdown").textContent = `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}
setInterval(() => { if ($("result").open) tickCountdown(); }, 1000);

function renderStats() {
  const h = store.get("jumple:history", {});
  const nums = Object.keys(h).map(Number).sort((a, b) => a - b);
  let streak = 0, best = 0, run = 0, prev = null;
  for (const n of nums) { run = prev !== null && n === prev + 1 ? run + 1 : 1; best = Math.max(best, run); prev = n; }
  if (nums.length && nums.at(-1) >= number - 1) streak = run;
  const deltas = nums.map((n) => h[n].hops - h[n].par);
  const atPar = deltas.filter((d) => d <= 0).length;
  $("stat-grid").innerHTML = [
    [nums.length, "Solved"],
    [nums.length ? Math.round((atPar / nums.length) * 100) + "%" : "–", "Par or better"],
    [streak, "Current streak"],
    [best, "Best streak"],
  ].map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join("");
  const buckets = [["Birdie+", (d) => d < 0], ["Par", (d) => d === 0], ["+1", (d) => d === 1], ["+2", (d) => d === 2], ["+3 or more", (d) => d >= 3]];
  const today = h[number] ? h[number].hops - h[number].par : null;
  const max = Math.max(1, ...buckets.map(([, f]) => deltas.filter(f).length));
  $("dist").innerHTML = buckets.map(([label, f]) => {
    const c = deltas.filter(f).length;
    const isToday = today !== null && f(today);
    return `<div class="bar${isToday ? " today" : ""}"><span>${label}</span><span class="fill" style="width:${Math.max(8, (c / max) * 100)}%">${c}</span></div>`;
  }).join("");
}

// A new day began while the tab was open: load the new puzzle.
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || !puzzle) return;
  const data = await fetch("/puzzles.json").then((r) => r.json());
  if (dayIndex(data.epoch) + 1 !== number) location.reload();
});

init();
