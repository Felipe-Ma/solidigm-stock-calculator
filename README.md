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
- Lets you add stock grants with a name, total shares, and the **vesting start date** from your agreement.
- Derives the vest schedule from the plan's fixed quarterly dates — Jan 30, Apr 30, Jul 30, Oct 30 — starting at the first such date strictly *after* the vesting start date, for 16 quarters.
- Shows upcoming vests as **gross units only**. The app never estimates tax.
- Lets you record what actually happened at each vest — net units received and the share price that day — and derives units withheld, value at vest, and what those units are worth today.
- Rolls those actuals up into net units held, total received at vest, and remaining gross units.
- Warns when per-grant gross corrections exceed a grant's total shares.
- Tracks current and future taxable income and 401k contributions for J1/J2, and compares the 2026 401k total against the $24,500 yearly cap.

## How vesting dates are calculated

The plan vests on four fixed calendar dates each year: **Jan 30, Apr 30, Jul 30, Oct 30**.

You enter the **vesting start date** from your agreement. The first vest is the next plan date *strictly after* that date — the start date itself is excluded, even when it falls on a plan date. The schedule then runs 16 quarters.

```
Vesting start 2025-04-30  ->  first vest 2025-07-30  (Apr 30 excluded)
Vesting start 2025-10-29  ->  first vest 2025-10-30
Vesting start 2025-12-31  ->  first vest 2026-01-30
```

Each grant card shows its derived first and last vest date so the result is verifiable without opening the schedule.

Earlier versions asked for the first vest date directly and anchored the schedule on whatever was typed, which drifted off the plan calendar. Saved grants are migrated: the stored date is now read as the vesting start date.

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
