# Jumple

A daily word puzzle: get from the start word to the goal word, changing up to **3 letters** per hop (swap, add or remove). Every hop must be a real word. Par is one more than the shortest possible route.

Live at https://jumple.vercel.app

## Layout

- `public/` — the whole site (static HTML/CSS/JS, no build step). Deployed to Vercel as-is.
  - `puzzles.json` — one puzzle per day from `epoch`: start, end, par, and a shortest route.
  - `words.txt` — words accepted as hops.
- `scripts/generate.mjs` — regenerates `puzzles.json` and `words.txt` (run once, offline).

## Regenerating puzzles

```bash
npm install
node scripts/generate.mjs 730   # days of puzzles
```

Difficulty knobs are at the top of `scripts/generate.mjs` (`MIN`, `MAX_CHANGES`, `CANDIDATES`). If you change `MAX_CHANGES`, change it in `public/app.js` too.

## Local preview

```bash
npx serve public
```
