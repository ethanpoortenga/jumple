// Builds public/words.txt (accepted guesses) and public/puzzles.json (one puzzle per day).
// Usage: node scripts/generate.mjs [days]
import { writeFileSync, mkdirSync } from "node:fs";
import { tiers, buildGraph, shortest, countShortest } from "./lib.mjs";

export const EPOCH = "2026-11-17"; // puzzle #1
export const MIN = 4; // shortest possible route, in hops, for every puzzle; par is one more
export const MAX_CHANGES = 3; // letters changed per hop; keep in sync with public/app.js
const CANDIDATES = 1; // pairs at distance MIN tried per day; the one with the fewest best routes wins (raise for harder puzzles)
const DAYS = Number(process.argv[2] || 730);
const BLOCK = new Set("kill dead death rape drug drugs nazi slave porn naked bomb suicide murder sexual sexy damn hell crap shit fuck bitch bastard penis breast blood corpse weapon terror".split(" "));

mkdirSync("public", { recursive: true });
const accepted = [...tiers(60)].filter((w) => w.length >= 2 || w === "a" || w === "i").sort();
writeFileSync("public/words.txt", accepted.join("\n"));

const parWords = [...tiers(20)];
const nb = buildGraph(parWords, MAX_CHANGES);
const pool = [...tiers(10)].filter(
  (w) => w.length >= 4 && w.length <= 8 && !/(s|ed|ing|ly)$/.test(w) && !BLOCK.has(w)
);

let seed = 20261117;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const used = new Set();
const pick = () => {
  for (;;) {
    const w = pool[Math.floor(rnd() * pool.length)];
    if (!used.has(w)) return w;
  }
};

const puzzles = [];
const t0 = Date.now();
for (let day = 0; day < DAYS; day++) {
  const date = new Date(EPOCH + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + day);
  const want = MIN; // same difficulty every day
  let best = null;
  for (let found = 0; found < CANDIDATES; ) {
    const a = pick(), b = pick();
    if (a === b || a[0] === b[0]) continue;
    const route = shortest(nb, a, b, want);
    if (!route || route.length - 1 !== want) continue;
    found++;
    const routes = countShortest(nb, a, b, want);
    if (!best || routes < best.routes) best = { start: a, end: b, min: want, par: want + 1, route, routes };
  }
  const { routes, ...puzzle } = best;
  puzzles.push(puzzle);
  used.add(best.start); used.add(best.end);
  if (day % 120 === 119) used.clear(); // start/goal words may repeat after ~4 months
  if (day % 25 === 0) console.log(day, ((Date.now() - t0) / 1000).toFixed(0) + "s", puzzles.at(-1));
}
writeFileSync("public/puzzles.json", JSON.stringify({ epoch: EPOCH, puzzles }));
console.log("done", puzzles.length, "puzzles,", accepted.length, "words");
