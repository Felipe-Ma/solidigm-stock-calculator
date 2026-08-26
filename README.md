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

Pushing to `main` triggers a Cloudflare Workers Build, which runs `npx wrangler deploy` and promotes the result to the live Worker. No manual step needed.

To deploy by hand (for example, to ship without committing):

```bash
npm run deploy
```

Your saved data lives in Workers KV, not in the deploy bundle, so deploying or rolling back never touches it. Use `npx wrangler rollback` to revert to the previous version.

Preview URLs are disabled on purpose: the Access application protects only the production hostname, so a preview URL would serve the app shell publicly.

## What it does now

- Syncs all stock, taxable-income, and 401k data through your Cloudflare account so any device you sign in from sees the same values.
- Lets you add stock grants with a name, category, share count, grant date, vesting start date, and tranche count.
- Derives vesting events from the plan's fixed quarterly dates, including grant-date catch-up for tranches that predate the grant.
- Shows upcoming vests as **gross units only**. The app never estimates tax.
- Lets you record what actually happened at each vest — net units received and the share price that day — and derives units withheld, value at vest, and what those units are worth today.
- Rolls those actuals up into net units held, total received at vest, and remaining gross units.
- Warns when per-grant gross corrections exceed a grant's total shares.
- Tracks current and future taxable income and 401k contributions for J1/J2, and compares the 2026 401k total against the $24,500 yearly cap.

## How vesting dates are calculated

Each grant carries a **grant date**, a **vesting start date**, a share count, and a tranche count (16 by default). Category (LTI / NH / Other) is a label only and never affects the calculation.

Tranches are generated from the **vesting start date** on the plan's fixed dates — **Jan 30, Apr 30, Jul 30, Oct 30** — beginning at the first such date strictly after the vesting start date.

A tranche scheduled **on or before the grant date** could not have vested yet, so it catches up and vests on the grant date instead. Several catch-up tranches therefore collapse into a single vesting event.

```
LTI  grant date 2025-04-30, vesting start 2025-04-30
     -> tranche 1 vests 2025-07-30 (nothing to catch up)

NH   grant date 2025-04-30, vesting start 2024-10-30
     -> tranches 1 (2025-01-30) and 2 (2025-04-30) both catch up
        and vest together on 2025-04-30
     -> 2025-07-30 is therefore tranche 3 of 16
```

A **vesting event** is one date; a **tranche** is one instalment of one grant. One event can hold several tranches, from one grant or several. The schedule labels events sequentially and shows the tranche makeup of each, with a *Catch-up* badge and the original scheduled date where relevant.

Each grant card shows its derived first and last vest date plus any catch-up, so the result is verifiable without opening the schedule.

## How vesting is recorded

Each period in the schedule is one of:

| State | Meaning |
| --- | --- |
| Upcoming | In the future. Shows projected gross units and their value at today's price. |
| Next | The next period due. |
| Awaiting actuals | The date has passed but nothing was recorded yet. |
| Recorded | You entered net units received and the price at vest. |

Only recorded periods count toward "net units held" — everything else is still counted as remaining gross. That keeps projections honest instead of guessing a withholding rate.

Earlier versions estimated post-tax units with a fixed 41.5% rate. Any saved post-tax corrections from that model are migrated automatically into recorded net units on first load.

## Seed data

`public/data/app-state.json` and `public/data/401k-contributions.json` are first-run placeholders only. Once your Cloudflare account has data, those files are ignored. Do not put real figures in them — this repository is public.
