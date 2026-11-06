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
## API

| Endpoint | Purpose |
|---|---|
| `POST /api/reports` | multipart `audio`, `language` (`hi` \| `en` \| `hi-en`), `durationMs?`, `mockTranscript?` (mock STT only). Streams NDJSON stage events, then the result. |
| `GET /api/reports`, `GET /api/reports/:id` | The current agent's reports |
| `POST /api/reports/:id/edit` | JSON `{ orderReference?, requestedAction?, notes? }` — re-verified |
| `POST /api/reports/:id/confirm` | The only path to an operational change |
| `POST /api/reports/:id/reject` | Discard; nothing changes |
| `GET /api/system/status` | Active providers and whether they are simulated |

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript |
| `npm test` | Vitest unit + pipeline tests |

## Status

- Gnani Prisma and Timbre adapters are stubbed until verified against official documentation; AI output comes
  from mock providers and is labelled **SIMULATED** in the UI.
- Verification, confirmation and execution are real. Data lives in an in-memory store that resets on restart
  (Supabase in step 8).
