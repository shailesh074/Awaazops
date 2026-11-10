# AwaazOps — Launch checklist and demo script

Prepared 2026-11-10 from a live audit of the code, the git history and the Supabase project.

## 1. Before going public

- [ ] **Rotate the Gnani API key.** It was pasted into a chat transcript during development. Request a new key,
      put it in `.env.local` and in Vercel, then revoke the old one.
- [ ] **Change the dispatcher test password** (it also appeared in a chat transcript):
      ```bash
      AWAAZ_PROVISION_PASSWORD='<new, 12+ chars>' npm run db:provision -- --email dispatcher@awaazops.test --role dispatcher
      ```
      Update `AWAAZ_TEST_DISPATCHER_PASSWORD` in `.env.local` to match.
- [ ] Optional: Supabase → Authentication → Sign In / Providers → turn off email **sign-ups**. Self-registered
      accounts get no role and see nothing, but closing sign-up removes the noise.

Verified clean (no action needed): no secret value appears in any tracked file, in any object of the git history, or
in the browser bundle. `.env.local` is gitignored and was never committed. Every module that reads a secret imports
`server-only`; no client component imports server code.

## 2. Supabase (already done — re-check only)

| Item | State |
|---|---|
| Migrations 001–005 | All applied live (`supabase_migrations.schema_migrations`). Nothing pending. |
| RLS | Enabled on all 12 public tables; read-only policies; agents see own rows, dispatchers all, anon nothing. |
| Client writes | Revoked. All writes go through 4 `SECURITY DEFINER` functions that only the service role can execute. |
| Storage | `recordings`, `prompt-audio`, `lab-audio` — all private; no client policies (server streams files after auth). |
| Audit | Append-only (triggers block UPDATE, DELETE, TRUNCATE). |
| Realtime | `voice_reports`, `audit_events`, `orders` published. |
| Accounts | `dispatcher@awaazops.test` (dispatcher), `agent101@awaazops.test` (agent, AG-101). Add more with `npm run db:provision`. |

- [ ] Supabase → Authentication → URL Configuration → **Site URL** = your Vercel URL (used in auth emails).

## 3. Vercel

1. Push the repository to GitHub and import it in Vercel (framework: Next.js, default build command).
2. **Function region:** Project Settings → Functions → **Tokyo (hnd1)**, next to the Supabase database
   (ap-northeast-1). The default US region adds a trans-Pacific round trip to every query.
3. **Environment variables** (Production and Preview):

| Variable | Required | Value |
|---|---|---|
| `AWAAZ_DATA_BACKEND` | **yes** | `supabase` — the default `memory` means *no sign-in* and data lost between instances |
| `NEXT_PUBLIC_SUPABASE_URL` | **yes** | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **yes** | Publishable (anon) key — public by design |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes, secret** | Secret / service-role key — server only |
| `AWAAZ_STT_PROVIDER` | **yes** | `gnani-prisma` — the default is `mock` (simulated) |
| `AWAAZ_TTS_PROVIDER` | **yes** | `gnani-timbre` — the default is `mock` (no voice) |
| `GNANI_API_KEY` | **yes, secret** | The **rotated** Gnani key |
| `GNANI_API_BASE_URL` | no | default `https://api.vachana.ai` |
| `GNANI_STT_MODEL` / `GNANI_STT_FORMAT` | no | defaults `prisma-v2.5` / `transcribe` (match local) |
| `GNANI_TTS_VOICE_HI` / `_EN` / `_HINGLISH`, `GNANI_TTS_CONTAINER` | no | defaults Nalini / Kaveri / Poorvi, `mp3` |
| `AWAAZ_REASONING_PROVIDER` | no | default `rules` (deterministic, no API key) |
| `ANTHROPIC_API_KEY`, `LLM_*` | no | only if you opt into Claude reasoning |

   Do **not** add to Vercel: `SUPABASE_DB_URL` (migrations from your machine only) and `AWAAZ_TEST_*` (local test
   accounts).

4. Deploy, then smoke-test:
   - `GET /api/system/status` → `gnani-prisma` and `gnani-timbre` with `"simulated": false, "configured": true`.
   - Sign in as the dispatcher → `/dashboard` and `/lab` load; the Lab shows run `LR-3c622c6f`.
   - Sign in as the agent on a phone (HTTPS is required for the microphone) → record a report → hear the prompt.

**Known limits.** Gnani allows one active request per key; the app queues calls per server instance, but two
instances can collide — a busy response is retried once, then shown as an error (nothing changes). Request bodies are
capped at 4.5 MB on Vercel; recordings are converted to 16 kHz mono WAV in the browser (30 s ≈ 1 MB), so they fit.

## 4. Live verification (2026-11-10, real sessions, real Gnani)

- Data isolation: the agent sees 4 of 22 orders and only their own reports; no Lab data; anonymous reads are denied;
  direct writes, audit deletes, write-function calls and storage listing are all denied.
- Pages: all agent and dispatcher pages return 200; cross-role and signed-out access redirects.
- Agent flow (Timbre-generated audio → Prisma → rules → verification → Timbre):
  "order chaar nau paanch do ka customer ghar pe nahi hai…" → ORD-4952, *Mark customer unavailable*, awaiting
  confirmation (Prisma 712 ms, rules 64 ms, verification 9 ms, Timbre 2.2 s). Prompt audio served; recording stored
  and playable by agent and dispatcher. Spoken "nahi" → heard "nahi" → rejected; the order was not changed; audit
  chain `REPORT_SUBMITTED → VALIDATION_COMPLETED → REPORT_REJECTED (via voice)`.
- Clarification: "Customer ghar pe nahi hai" → "Yeh kaunse order ke baare mein hai? Order number boliye."; confirming
  it is refused (409).
- APIs: another agent's report/recording → 404, confirm → 403; agent → Lab run 403; dispatcher → submit report 403;
  signed out → 401.
- Not exercised by a person in a browser yet: the visual click-through (sign-in form, recording UI, playback,
  "Reply by voice", Lab upload). Do one rehearsal before recording the demo.

## 5. 60-second demo script

Every step below uses the live Gnani integrations. The demo **changes a real order** (step 3), so rehearse on another
agent order or accept one take. AG-101's open orders: ORD-4821, ORD-4907, ORD-4952.

| Time | Screen | Say / do |
|---|---|---|
| 0–8 s | Agent portal on a phone | "Delivery agents report problems by voice — in Hindi, Hinglish or English. AwaazOps turns that into a verified action." |
| 8–22 s | Record | Speak: *"Order 4952 ka customer ghar pe nahi hai, phone nahi utha rahe."* The progress shows real stages: Gnani Prisma transcribes, the rules engine extracts, the database verifies. Point at the **Live** badge and the highlighted evidence words. |
| 22–32 s | Review | Timbre speaks the confirmation in Hinglish: *"Order 4952: customer unavailable mark karun? Confirm karein."* "The order was checked against the database and against this agent's route. Nothing has changed yet." |
| 32–40 s | Reply by voice | Say *"Haan"*. The order is updated. "Only a clear yes confirms; anything unclear changes nothing." |
| 40–50 s | Dispatcher dashboard (open beforehand in a second window) | The update arrives through Supabase Realtime without a reload — confirm this in the rehearsal; if it doesn't, refresh once. Open the audit trail: submitted → validated → confirmed **by voice, with the words heard** → executed → order updated. |
| 50–60 s | Testing Lab | "We measure reliability, not just accuracy. In this measured run Prisma misheard *aath* as *aap* — so instead of updating the wrong order, AwaazOps asked for clarification. Zero unsafe updates." (State that the run uses two synthetic Timbre clips.) |

Do not quote accuracy percentages beyond what the Lab page shows for the run on screen.
