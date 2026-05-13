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
- Shows the per-quarter vesting layout and total shares scheduled.
