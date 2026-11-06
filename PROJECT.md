# AwaazOps — Project Charter

> **Voice → Intelligence → Verification → Action**
>
> An AI voice operations intelligence platform for India's last-mile delivery and logistics industry.
> Built solo for the *Great Indian AI Internship Challenge* by Gnani AI.

This file is the persistent source of truth for vision, requirements, architecture principles and
development sequence. Update it when a decision changes; record the decision in the Decision Log.

---

## 1. Problem

Delivery agents hit operational exceptions all day: customer unavailable, wrong address, reschedule
requests, unclear instructions, undeliverable packages. They report these by phone call or voice note.
Dispatchers then listen, interpret, type up and update systems by hand. The result is slow handling,
inconsistent records and lost information.

## 2. Solution

AwaazOps turns a natural spoken report (Hindi, English, Hinglish, regional accents, noisy streets) into a
**structured, verified, confirmed** operational action with a full audit trail.

Example input:

> "Boss, order 4821 ka customer ghar pe nahi hai. Usne bola shaam 6 baje ke baad delivery karna."

Expected outcome:

| Field | Value | Evidence (transcript span) |
|---|---|---|
| order_id | `4821` → verified `ORD-4821` | "order 4821" |
| issue | `CUSTOMER_UNAVAILABLE` | "customer ghar pe nahi hai" |
| requested_action | `RESCHEDULE` | "delivery karna" |
| time_constraint | after 18:00 IST, today | "shaam 6 baje ke baad" |

Then a spoken confirmation (Timbre) → agent confirms → action is saved → dashboard updates.

### Pipeline

1. Capture the agent's voice (browser recording or upload).
2. Speech-to-text via **Gnani Prisma v2.5**.
3. LLM reasoning over the transcript.
4. Structured extraction: order ID, issue, requested action, time, notes.
5. Validation against the order database.
6. Voice confirmation via **Gnani Timbre v2.5**.
7. Explicit agent confirmation (confirm / edit / reject).
8. Persist the confirmed action + audit event.
9. Reflect on the operations dashboard.

## 3. Modules

### A. Agent Portal (mobile-first)
Voice recorder · language selection · live waveform · transcript display · extracted-fields preview ·
validation results · voice confirmation playback · confirm / edit / reject · report history.

### B. Operations Dashboard (desktop-first)
KPIs (total orders, pending exceptions, completed actions, failed deliveries, rescheduled) ·
priority-based issue queue · order search & filtering · exception detail inspector (audio, transcript,
evidence highlights, validation trail) · activity & audit history.

### C. Intelligence Testing Lab
Audio upload & recording · labelled test sets (accents, Hindi, Hinglish, noise levels) · raw transcript
view · extracted JSON inspector · field-level accuracy vs. ground truth · per-stage latency ·
failed / ambiguous case explorer.

## 4. Differentiator — Intelligence Reliability Engine

The engine sits between the LLM and the database. **The LLM proposes; deterministic code decides.**

- **Schema enforcement** — every LLM output is parsed with Zod; invalid output is rejected or retried, never trusted.
- **Evidence linking** — every extracted field must cite the transcript span it came from; fields with no
  verifiable evidence are downgraded to "unverified".
- **Normalisation** — spoken digits ("chaar aath do ek", "forty-eight twenty-one"), Hinglish time phrases
  ("shaam 6 baje ke baad", "kal subah"), relative dates resolved in Asia/Kolkata.
- **Database verification** — order ID must exist, belong to / be assigned to this agent, and be in a state
  where the requested action is allowed.
- **Missing-information detection** — required fields per action type; if missing, generate a
  clarification question (text + Timbre voice).
- **Ambiguity handling** — multiple candidate orders, conflicting times, low STT confidence → clarification,
  never a guess.
- **Action gate** — nothing is written to operational tables without (a) passing validation and
  (b) explicit human confirmation.
- **Audit trail** — every stage (audio, transcript, extraction, validation, confirmation, execution) is
  recorded and linked.

## 5. Technology Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 16 (App Router), TypeScript (strict), Tailwind CSS, shadcn/ui, Lucide |
| Backend | Next.js Route Handlers / Server Actions, server-only service modules |
| STT | Gnani Prisma v2.5 |
| TTS | Gnani Timbre v2.5 |
| Reasoning | Provider-agnostic LLM adapter (provider TBD); Evon v3.3 optional, never required |
| Database / Auth / Storage | Supabase (PostgreSQL, Auth, Storage, Row Level Security) |
| Validation | Zod |
| Deployment | GitHub → Vercel |

## 6. Engineering Principles (non-negotiable)

1. **Secrets are server-side only.** API keys live in env vars read by `server-only` modules. No
   `NEXT_PUBLIC_` prefix on any secret. Browser talks only to our API routes.
2. **Never trust AI output.** All structured outputs are schema-validated and evidence-checked.
3. **Verify against real records.** Order IDs are checked against the database, not the LLM's memory.
4. **No action without confirmation.** Operational writes require an explicit confirmed state.
5. **Fail loudly and gracefully.** Transcription failures, timeouts and ambiguity produce clear UI states
   and clarification flows, not silent fallbacks.
6. **Audit everything** that changes operational state.
7. **Honest provenance.** Every AI result carries `provider` (`gnani-prisma`, `gnani-timbre`, `<llm>`, or
   `mock`). Mock results are visibly badged "SIMULATED" in the UI and never presented as Gnani output.
8. **No invented integrations.** Gnani adapters are implemented only against verified official
   documentation. Until then, adapters exist as typed interfaces + clearly labelled mocks.
9. **Typed, modular, reusable.** Strict TypeScript, provider interfaces, small composable components.
10. **Responsive.** Agent Portal is mobile-first (agents are on phones); dashboard and lab are desktop-first
    but usable on tablets.

## 7. System Architecture

```
 Browser (Agent Portal / Dashboard / Lab)
   │  audio blob, form actions             ▲ JSON, TTS audio, realtime updates
   ▼                                       │
 Next.js API layer (Route Handlers, server-only)
   │
   ├── Pipeline Orchestrator  ── runs stages, records timings, persists each stage
   │     ├── STT Adapter        (SpeechToTextProvider)  → GnaniPrisma | Mock
   │     ├── Reasoning Adapter  (ReasoningProvider)     → LLM | Mock
   │     ├── Reliability Engine (deterministic)
   │     │     schema → normalise → evidence → DB verify → policy → clarify
   │     ├── TTS Adapter        (TextToSpeechProvider)  → GnaniTimbre | Mock
   │     └── Action Executor    (only from CONFIRMED state, transactional, audited)
   │
   └── Repositories ──► Supabase (Postgres + RLS, Auth, Storage for audio)
```

### Report lifecycle (state machine)

```
RECORDED → TRANSCRIBED → EXTRACTED → VALIDATED ─┬─► AWAITING_CONFIRMATION ─┬─► CONFIRMED → EXECUTED
                                                 │                          ├─► EDITED → (re-validate)
                                                 └─► NEEDS_CLARIFICATION    └─► REJECTED
            (any stage) ─► FAILED (with reason)
```

### Core data model (initial draft)

- `agents` — profile, phone, preferred language, linked to Supabase Auth user.
- `orders` — id, customer, address, slot, status, assigned agent, priority.
- `voice_reports` — agent, audio path, language, status (state machine), timings.
- `transcripts` — report, provider, text, confidence, segments, latency.
- `extractions` — report, provider, raw JSON, parsed JSON, evidence spans, schema-valid flag.
- `validations` — report, checks[] (name, passed, detail), outcome, clarification question.
- `operational_actions` — report, order, action type, payload, status, confirmed_by, confirmed_at.
- `audit_events` — actor, entity, event type, before/after, timestamp (append-only).
- `lab_samples` — audio, tags (accent, language, noise), ground-truth transcript + fields.
- `lab_runs` / `lab_results` — per-sample outputs, field accuracy, WER, per-stage latency.

### Action types (initial)
`RESCHEDULE`, `CUSTOMER_UNAVAILABLE`, `ADDRESS_ISSUE`, `UPDATE_INSTRUCTIONS`, `DELIVERY_FAILED`,
`ESCALATE_TO_DISPATCHER` (fallback for anything not confidently classifiable).

## 8. Folder Structure

```
awaazops/
├─ PROJECT.md
├─ .env.example                  # names only, no values
├─ supabase/
│  ├─ migrations/                # SQL schema + RLS policies
│  └─ seed.sql                   # demo orders/agents (clearly demo data)
├─ src/
│  ├─ app/
│  │  ├─ page.tsx                # entry page linking the three modules
│  │  ├─ (auth)/login/           # step 8
│  │  ├─ (agent)/agent/          # mobile shell: report, history, report/[id]
│  │  ├─ (console)/              # desktop shell (sidebar) shared by ops + lab
│  │  │  ├─ dashboard/           # overview, exceptions, orders, audit, exceptions/[id]
│  │  │  └─ lab/                 # runs, samples, runs/[id]
│  │  ├─ api/
│  │  │  ├─ system/status/       # provider status (names + booleans only) ✅
│  │  │  ├─ reports/             # POST create (audio) ; [id]/confirm ; [id]/reject ; [id]/edit
│  │  │  ├─ stt/  tts/  extract/ # stage endpoints (used by lab + debugging)
│  │  │  └─ lab/
│  │  └─ layout.tsx, globals.css # design tokens live in globals.css
│  ├─ components/
│  │  ├─ ui/                     # shadcn primitives (radix-nova)
│  │  ├─ layout/                 # console nav, mobile nav, agent tab bar
│  │  ├─ shared/                 # BrandMark, ProviderBadge (LIVE / SIMULATED), PageHeader
│  │  ├─ audio/                  # Recorder, Waveform, AudioPlayer
│  │  └─ agent/  dashboard/  lab/
│  ├─ domain/                    # isomorphic types + Zod schemas + report lifecycle ✅
│  ├─ server/                    # server-side only (I/O modules import 'server-only')
│  │  ├─ env.ts                  # Zod-validated env ✅
│  │  ├─ providers/              # ✅ interfaces + mocks; Gnani adapters stubbed
│  │  │  ├─ stt/   {types, gnani-prisma, mock, index}
│  │  │  ├─ tts/   {types, gnani-timbre, mock, index}
│  │  │  ├─ llm/   {types, mock, index}
│  │  │  └─ status.ts, errors.ts
│  │  ├─ reliability/            # ✅ pure: validate, order-reference, policy, prompts
│  │  ├─ pipeline/               # ✅ submit / edit / confirm / reject orchestration
│  │  ├─ actions/                # ✅ pure applyAction (confirmed-only by lifecycle)
│  │  ├─ repositories/           # ✅ OperationsRepository + in-memory impl (Supabase in step 8)
│  │  ├─ data/                   # ✅ read side for pages (request-time)
│  │  ├─ auth/current-agent.ts   # demo agent until Supabase Auth
│  │  └─ http.ts                 # uniform API errors
│  ├─ lib/                       # isomorphic utils (cn, formatting, time, ids)
│  └─ hooks/                     # useRecorder, useWaveform, useRealtime
└─ tests/
   ├─ unit/                      # ✅ Vitest: validation, lifecycle, pipeline, metrics
   ├─ stubs/                     # test stand-ins (server-only)
   └─ fixtures/                  # labelled audio for the lab (step 5+)
```

## 9. Development Sequence

Each step ends in a verifiable, demoable state before moving on.

1. **Understand the product** — this document. ✅
2. **Architecture & scaffold** — Next.js 16 app, Tailwind, shadcn/ui, design tokens, folder skeleton, env schema, provider interfaces, domain types. ✅
3. **Frontend** — design system, Agent Portal, Operations Dashboard, Testing Lab on typed mock data (badged SIMULATED). ✅
   - Demo fixtures live in `src/mocks/`; pages read them only through `src/server/data/` (swap to Supabase in step 8).
   - Agent Portal records real audio (MediaRecorder + live waveform) but runs a scripted pipeline
     (`src/lib/demo/pipeline.ts`) — replaced by `POST /api/reports` in step 4.
   - Lab scores (WER, field accuracy, unsafe updates) are real computations in `src/lib/lab-metrics.ts`
     over simulated outputs; latencies are labelled illustrative.
4. **Backend services** — API routes, pipeline orchestrator, state machine, repositories (in-memory first). ✅
   - `POST /api/reports` streams NDJSON stage events; `/api/reports/:id/{confirm,edit,reject}`; `GET /api/reports[/:id]`.
   - `src/server/pipeline/process-report.ts` enforces the lifecycle on every transition, measures stage latency,
     audits every state change, and re-checks the order at confirm time.
   - The deterministic core of the Reliability Engine was brought forward from step 6 (`src/server/reliability/`):
     schema, evidence grounding/repair, required fields, order existence + near-miss suggestion, assignment,
     status policy, time validity, confidence. Step 6 adds the real LLM, spoken-number/time normalisation and
     language-aware prompts.
   - In-memory repository (`src/server/repositories/memory.ts`), per process, resets on restart.
   - Vitest: `npm test` (lifecycle, validation, order references, actions, lab metrics, full pipeline).
5. **Prisma integration** — after verifying official docs: auth, audio format, sync vs. streaming, language codes.
6. **Reasoning & validation** — LLM adapter, extraction schema, Reliability Engine with unit tests.
7. **Timbre integration** — after verifying docs: voices, languages, output format.
8. **Supabase** — schema, RLS, Auth, Storage, seed data, realtime dashboard.
9. **End-to-end integration** — full flow on real providers, error and clarification paths.
10. **Test, optimise, deploy** — lab benchmark run, latency tuning, Vercel deploy, demo script.

## 10. Design Direction

Premium enterprise AI product. Graphite / deep charcoal surfaces, one restrained blue-violet accent,
clean typography (Inter or Geist + a mono for IDs/JSON), generous spacing, refined data tables, subtle
motion (≤200ms, purposeful), elegant recording + waveform interaction. Avoid template look, heavy
gradients, glow effects and clutter. The UI should communicate trust and technical precision.

## 11. Open Assumptions (to verify)

- [ ] Gnani Prisma v2.5: endpoint, auth scheme, sync REST vs. streaming, accepted audio formats / sample
      rates, max duration, supported language codes (hi-IN, en-IN, Hinglish/code-mixed?), confidence & timestamps in response.
- [ ] Gnani Timbre v2.5: endpoint, auth, voices per language, output format (mp3/wav/pcm), latency, SSML support.
- [ ] Gnani credential access timeline and rate limits for the challenge.
- [ ] Evon v3.3 availability and fit.
- [ ] LLM provider choice and its structured-output support.
- [x] Next.js 16 conventions: v16.4.5 with Cache Components + Partial Prefetching on by default. Runtime /
      uncached data must sit inside `<Suspense>` or behind `connection()`; `proxy.ts` replaces middleware.
      Bundled docs live in `node_modules/next/dist/docs/` — read them before using a new API (see AGENTS.md).
- [ ] Vercel plan limits: request body size (~4.5 MB) and function duration → audio may need direct-to-Storage upload.
- [ ] Auth model for the demo: agents and dispatchers as Supabase Auth users with roles.
- [ ] Order ID format in seed data (e.g. numeric `4821` spoken, stored as `ORD-4821`).

## 12. Decision Log

| Date | Decision | Reason |
|---|---|---|
| 2026-11-05 | Provider adapter interfaces with explicit `provider` provenance on every result | Honest mock vs. real separation; swap providers without touching UI |
| 2026-11-05 | LLM proposes, deterministic Reliability Engine decides | AI output is never trusted for operational writes |
| 2026-11-05 | Button confirmation is primary; spoken "haan/confirm" is an enhancement | Reliability in noisy environments |
| 2026-11-05 | Single dark theme; tokens in `globals.css`, `.dark` on `<html>`, `next-themes` removed | Design direction is dark-only; fewer moving parts |
| 2026-11-05 | shadcn/ui `radix-nova` preset, Geist + Geist Mono | Stable Radix primitives; mono for IDs/JSON |
| 2026-11-05 | Domain types live in `src/domain/` as Zod schemas | One source for runtime validation and TS types, shared client/server |
| 2026-11-05 | Provider chosen by `AWAAZ_*_PROVIDER` env; real provider failures are surfaced, never swapped for mocks | Honest provenance |
| 2026-11-05 | Mock STT ignores audio and returns a fixed or supplied transcript; mock TTS returns no audio | Mocks must not pretend to be AI |
| 2026-11-06 | No browser speech synthesis as a stand-in for Timbre; the play control stays disabled until Timbre is integrated | A fake voice would misrepresent the product |
| 2026-11-06 | Demo evidence offsets are computed from transcript text (`src/mocks/build.ts`) | Highlights can never point at the wrong words |
| 2026-11-06 | Lab headline metric is "unsafe updates" (wrong order ID that still verified), alongside accuracy | Reliability, not raw accuracy, is the differentiator |
| 2026-11-06 | Components that call `usePathname` sit inside `<Suspense>` with a hook-free fallback | Required by Cache Components for routes with dynamic params |
| 2026-11-06 | Exception detail reads params inside `<Suspense>` (no `generateStaticParams`) | Works unchanged once IDs come from the database; trade-off: unknown IDs render not-found UI with HTTP 200 |
| 2026-11-06 | Validation is a pure function over an order snapshot; the pipeline does all I/O | Testable without a database; same engine for submit and edit |
| 2026-11-06 | Ungrounded values are removed, not flagged; offsets are repaired when the quote exists elsewhere | "Unverified" must never reach an action |
| 2026-11-06 | Near-miss order suggestions only when exactly one candidate on the agent's own route | Never guess between candidates |
| 2026-11-06 | Agent-typed edits are exempt from transcript grounding but still fully re-verified | The agent is the source of truth for their own corrections |
| 2026-11-06 | Order is re-checked at confirm time; a changed order fails the report instead of writing | Confirmation can lag verification |
| 2026-11-06 | TTS failure is non-fatal; the prompt is still shown as text | A voice outage must not block operations |
| 2026-11-06 | Agent identity resolved server-side (`getCurrentAgentId`), never from the request body | No spoofable actor before auth exists |
| 2026-11-06 | `POST /api/reports` streams NDJSON stage events | Progress UI reflects real work, not timers |
| 2026-11-06 | `@types/node` bumped to ^22 | Required by Vitest 5 peer range |
