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

### Projections for upcoming vests

Unvested events show gross RSUs and their gross value at today's price, plus an estimated after-tax view: estimated shares withheld, estimated net shares received, and a **projected** owned balance that runs forward from your real current balance.

The estimate uses an editable withholding percentage (default 41.3%, matching historical net retention of ~58.7%). Projections are labelled as estimates and never alter the real "Shares owned today" figure — that only moves on recorded actuals and transactions.

Once both actuals are entered, the event derives the tax side:

```
shares withheld    = corrected gross units - net units received
gross vest value   = corrected gross units x share price at vest
withholding value  = shares withheld       x share price at vest
net value received = net units received    x share price at vest
```

Withheld shares never reduce vesting progress — progress is measured in gross units vested.

## Shares owned vs future RSUs

The **Share ledger** tab keeps two running totals that never mix:

| | Driven by |
| --- | --- |
| **Shares owned** | Net shares actually delivered, plus purchases and transfers in, minus cash-outs, sales, and transfers out |
| **Gross RSUs vested** | Gross units of each vest as it occurs — never reduced by withholding, cash-outs, or sales |

Unvested RSUs are never counted as owned.

Gross units count toward vesting progress on the **vest date**; net shares enter the owned balance on the **settlement date**. When those differ the timeline shows two rows — the vest, then the delivery.

Transaction types are cash-out, sale, purchase, transfer in, and transfer out. Cash-outs, sales, and purchases require a price so proceeds can be recorded; transfers do not. Cash is reported as generated by the corporate event rather than kept as a running cash balance — shares owned stays the primary balance.

### Reconciling against Shareworks

The timeline shows `Owned after` on every row, so you can walk down it against a broker statement and find the first row that disagrees. Three conditions are flagged rather than hidden:

- a removal larger than the recorded balance, with the exact shortfall
- a past vest with no recorded actuals, whose net shares are therefore missing
- recorded net shares exceeding that vest's gross

## Share rounding

Grant totals rarely divide evenly into whole shares, so tranche sizes come from rounding the *cumulative* vested total at each tranche, half-up:

```
cumulative(n) = roundHalfUp(total x n / trancheCount)
tranche(n)    = cumulative(n) - cumulative(n-1)
```

The rounding uses integer arithmetic — `floor((2·a + b) / (2·b))` — so totals landing exactly on `.5` are deterministic rather than subject to floating-point drift. A 4,344-share grant over 16 tranches sits on `.5` at every odd tranche, and this reproduces the broker's `272, 271, 272, 271…` rather than inverting it.

Tranche amounts always sum back to the grant total exactly.

Allocation and grouping are separate steps: tranche sizes are computed first from the grant total, then the vest-date and catch-up rules decide which tranches share a vesting event. A manual "correct gross" entry replaces only that tranche — the others keep their allocated size so the schedule stays reproducible.

One-off grants that vest in full bypass the allocator entirely; their single tranche is the whole award.

Never infer a grant total from an individual tranche size — several different totals can produce the same tranche.

Earlier versions estimated post-tax units with a fixed 41.5% rate. Any saved post-tax corrections from that model are migrated automatically into recorded net units on first load.

## Seed data

`public/data/app-state.json` and `public/data/401k-contributions.json` are first-run placeholders only. Once your Cloudflare account has data, those files are ignored. Do not put real figures in them — this repository is public.
