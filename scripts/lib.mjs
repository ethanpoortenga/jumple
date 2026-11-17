import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const dir = "wordlist-english/";

export function tiers(max) {
  const out = new Set();
  for (const s of [10, 20, 35, 40, 50, 55, 60, 70]) {
    if (s > max) break;
    for (const v of ["english", "american"])
      for (const w of require(`${dir}${v}-words-${s}.json`))
        if (/^[a-z]+$/.test(w)) out.add(w);
  }
  return out;
}

// Levenshtein distance with early exit when it must exceed `max`.
export function lev(a, b, max = 99) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

function deletes(w, k, acc = new Set()) {
  acc.add(w);
  if (k === 0 || w.length <= 1) return acc;
  for (let i = 0; i < w.length; i++) {
    const v = w.slice(0, i) + w.slice(i + 1);
    if (!acc.has(v)) deletes(v, k - 1, acc);
  }
  return acc;
}

// Graph where an edge joins two words at most `k` edits apart (SymSpell-style index).
export function buildGraph(words, k = 3) {
  const index = new Map();
  for (const w of words)
    for (const v of deletes(w, k)) {
      let l = index.get(v);
      if (!l) index.set(v, (l = []));
      l.push(w);
    }
  const cache = new Map();
  return function neighbors(w) {
    let n = cache.get(w);
    if (n) return n;
    const cand = new Set();
    for (const v of deletes(w, k)) for (const c of index.get(v) || []) cand.add(c);
    cand.delete(w);
    n = [...cand].filter((c) => lev(w, c, k) <= k);
    cache.set(w, n);
    return n;
  };
}

// Shortest hop path from a to b.
export function shortest(neighbors, a, b, maxDepth = 8) {
  const parent = new Map([[a, null]]);
  let frontier = [a];
  for (let d = 0; d < maxDepth && frontier.length; d++) {
    const next = [];
    for (const w of frontier)
      for (const n of neighbors(w)) {
        if (parent.has(n)) continue;
        parent.set(n, w);
        if (n === b) {
          const path = [b];
          for (let p = w; p; p = parent.get(p)) path.unshift(p);
          return path;
        }
        next.push(n);
      }
    frontier = next;
  }
  return null;
}

// Number of distinct shortest paths from a to b (fewer = harder to find).
export function countShortest(neighbors, a, b, depth) {
  let layer = new Map([[a, 1]]);
  const seen = new Set([a]);
  for (let d = 0; d < depth; d++) {
    const next = new Map();
    for (const [w, n] of layer)
      for (const x of neighbors(w)) if (!seen.has(x)) next.set(x, (next.get(x) || 0) + n);
    for (const x of next.keys()) seen.add(x);
    if (next.has(b)) return next.get(b);
    layer = next;
  }
  return 0;
}
