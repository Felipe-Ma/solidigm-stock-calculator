# Solidigm Stock Calculator

A simple local web app for mapping stock grants across a standard 4-year LTI vesting plan.

## Run locally

```bash
npm install
npm run start
```

Then open http://127.0.0.1:5173 in your browser.

## What it does now

- Stores grants in your browser's local IndexedDB database so they are still there when you come back.
- Lets you add stock grants with a name, total shares, and first vest date.
- Automatically creates a 4-year LTI schedule with 16 quarterly vest events for every grant.
- Divides each grant evenly across those 16 quarters.
- Lets you enter a stock price to estimate total value, next vest value, each vest value, and running vested value.
- Shows a compact per-quarter vesting table with total shares scheduled, running totals, and percentage remaining after each vest.
- Tracks current and future 401k contributions for J1/J2, stores them as JSON, and compares the 2026 total with the $24,500 yearly cap.

## 401k JSON workflow

The app reads 401k data from `data/401k-contributions.json` and merges it with locally saved browser entries while skipping duplicates. To make 401k updates pushable:

1. Use the 401k tab to add/import/autofill contributions.
2. Click **Download repo JSON** or **Copy repo JSON**.
3. Replace `data/401k-contributions.json` with that JSON.
4. Commit and push the JSON file change.

Local IndexedDB values are still saved for fast browser use, and the repo JSON is the pushable source you can commit.
