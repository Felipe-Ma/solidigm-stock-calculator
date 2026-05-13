# Solidigm Stock Calculator

A simple local web app for mapping stock grants across quarterly vest dates.

## Run locally

```bash
npm install
npm run start
```

Then open http://127.0.0.1:5173 in your browser.

## What it does now

- Starts with these example quarter dates:
  - `1/30/25`
  - `4/30/25`
  - `7/30/25`
  - `10/30/25`
- Lets you add stock grants with a name, total shares, start date, and end date.
- Divides each grant evenly across every quarter date from its start through its end.
- Shows the per-quarter vesting layout and total shares scheduled.
