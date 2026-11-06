# AwaazOps

Voice operations intelligence for India's last-mile delivery: **Voice → Intelligence → Verification → Action.**

See [PROJECT.md](PROJECT.md) for the vision, architecture and development sequence.

## Run locally

```bash
npm install
cp .env.example .env.local   # all providers default to mock (SIMULATED)
npm run dev
```

- `/agent` — Agent Portal (mobile-first)
- `/dashboard` — Operations Dashboard
- `/lab` — Intelligence Testing Lab
- `/api/system/status` — which AI providers are active and whether they are simulated

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | Typecheck |

## Status

Gnani Prisma and Timbre adapters are stubbed until verified against official documentation.
Until then AI output comes from mock providers and is labelled **SIMULATED** in the UI.
