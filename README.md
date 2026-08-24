# Solidigm Stock Calculator

A web app for mapping stock grants across a standard 4-year LTI vesting plan, plus taxable-income and 401k contribution tracking. It runs as a Cloudflare Worker and stores your data in your own Cloudflare account, so the same numbers follow you to every device.

**Live:** https://solidigm-stock.lilfil2001.workers.dev

## Architecture

| Piece | Location | Purpose |
| --- | --- | --- |
| Static site | `public/` | HTML, CSS, and the app itself, served as Workers static assets |
| API | `worker/index.js` | `GET`/`PUT /api/state`, backed by Workers KV |
| Storage | Workers KV namespace `APP_STATE` | One JSON blob per signed-in email |
| Auth | Cloudflare Access | Email one-time PIN; the Worker independently verifies the Access JWT |

IndexedDB is still used, but only as an offline cache. Cloudflare is the source of truth: on load the app pulls from KV, and every edit is debounced and pushed back up.

## Run locally

```bash
npm install
npm run dev
```

Then open http://127.0.0.1:8787.

## Deploy

```bash
npm run deploy
```

## What it does now

- Syncs all stock, taxable-income, and 401k data through your Cloudflare account so any device you sign in from sees the same values.
- Falls back to `public/data/app-state.json` for first-run seed data.
- Lets you add stock grants with a name, total shares, and first vest date.
- Automatically creates a 4-year LTI schedule with 16 quarterly vest events for every grant.
- Divides each grant evenly across those 16 quarters.
- Lets you enter a stock price to estimate total value, next vest value, each vest value, and running vested value.
- Lets you set the tax withholding rate (default 41.5%) used for all expected post-tax unit and value estimates.
- Highlights the next upcoming vest, dims already-vested periods, and warns when gross corrections exceed a grant's total shares.
- Shows a compact per-quarter vesting table with total shares scheduled, running totals, and percentage remaining after each vest.
- Tracks current and future taxable income and 401k contributions for J1/J2, stores them as JSON, and compares the 2026 401k total with the $24,500 yearly cap.

## Pushable data workflow

Browsers cannot directly write into your git working tree, so the app keeps fast local saves in IndexedDB and gives you a manual repo JSON export for commits.

1. Run the app and enter/update grants, stock price, taxable-income entries, 401k entries, baselines, or vest corrections.
2. On the **Stock calculator** tab, click **Download repo data** or **Copy repo data**.
3. Replace `data/app-state.json` with that exported JSON.
4. Commit and push `data/app-state.json`.
5. On another PC, run `git pull` and open the app. If that browser does not already have local saved data for this app, it will load the shared data from `data/app-state.json` and show the same inputs/results.

If a browser already has local saved data, those local values are preserved and merged with repo entries where possible. To make that PC use only freshly pulled repo data, clear the site data/IndexedDB for this local app in the browser and reload.

## Legacy 401k JSON workflow

The app still reads `data/401k-contributions.json` as a fallback for older exports, but new shared data should go through `data/app-state.json` so stock grants, taxable income, and 401k data travel together.
