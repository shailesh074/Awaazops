# AwaazOps

Voice operations intelligence for India's last-mile delivery: **Voice → Intelligence → Verification → Action.**

See [PROJECT.md](PROJECT.md) for the vision, architecture, decision log and development sequence.

## Run locally

```bash
npm install
cp .env.example .env.local   # then add GNANI_API_KEY (or set the speech providers to "mock" for offline dev)
npm run dev
```

- `/agent` — Agent Portal (mobile-first)
- `/dashboard` — Operations Dashboard
- `/lab` — Intelligence Testing Lab
- `/login` — sign-in (Supabase mode)

**Required AI integrations:** Gnani Prisma v2.5 (speech-to-text) and Gnani Timbre v2.5 (voice), via `GNANI_API_KEY`.

**Reasoning needs no paid API.** The default `AWAAZ_REASONING_PROVIDER=rules` is a deterministic engine for
Hindi (Devanagari), Hinglish and Indian English: order numbers in digits, digit words or Prisma's spaced digits;
delivery issues; times like "शाम सात बजे के बाद" / "kal subah" / "after 6 pm". It invents no confidence scores.
An LLM is an optional enhancement (`AWAAZ_REASONING_PROVIDER=claude` + `ANTHROPIC_API_KEY`); if it is not
configured, fails, refuses or times out, the rules engine answers and the fallback is recorded on the report.
Either way, every result goes through the same normaliser, database verification and agent confirmation.

Every result shows where it came from: **Live** (Gnani / an LLM), **Rules** (deterministic, marked "fallback" when
it stood in for an LLM), or **Simulated** (mock providers and scripted demo data).

**Live dashboard.** With Supabase, the console subscribes to Realtime changes on reports, audit events and orders
(filtered by RLS for the signed-in user) and refreshes itself; in demo mode it re-checks every 15 s while visible.

**Testing Lab.** Save labelled clips (upload or record) on `/lab`, then **Run benchmark**: each clip goes through
Gnani Prisma, the active reasoning engine and database verification, with every stage timed. The page shows the
latest measured run; until one exists it shows the scripted demo run under a "demo data" banner.

**Spoken confirmation.** Agents can answer the confirmation prompt by voice ("haan" / "nahi", "हाँ" / "नहीं",
"yes" / "no"). Only a reply made entirely of yes-words (or no-words) plus fillers counts; anything else changes
nothing. The buttons remain the primary path, and the audit trail records what was heard.

## Connect Supabase

1. Create a Supabase project. Put its URL, publishable (anon) key, secret (service role) key and the
   **Session pooler** connection string (`SUPABASE_DB_URL`, with your database password and no `[ ]`) in
   `.env.local`, and set `AWAAZ_DATA_BACKEND=supabase`.
2. Apply the schema and demo data:
   ```bash
   npm run db:migrate -- --seed
   ```
   Migrations are recorded in `supabase_migrations.schema_migrations`, so re-running is safe and the Supabase CLI
   sees them as applied. (Alternatively paste `supabase/migrations/*.sql` in order, then `supabase/seed.sql`, into
   the SQL editor.)
3. Create users and give them a role. Set the password in the environment, not on the command line:
   ```bash
   AWAAZ_PROVISION_PASSWORD='…' npm run db:provision -- --email ravi@example.com --role agent --agent AG-101
   AWAAZ_PROVISION_PASSWORD='…' npm run db:provision -- --email ops@example.com --role dispatcher
   ```
4. `npm run dev` and sign in at `/login`. Agents land on `/agent`, dispatchers on `/dashboard`.

**Sign in with Google (optional).** The button appears on `/login` automatically once Google is enabled in Supabase:
1. Google Cloud Console → APIs & Services → Credentials → *Create OAuth client ID* (Web application). Authorised
   redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
2. Supabase → Authentication → Sign In / Providers → Google: enable, paste the client ID and secret.
3. Supabase → Authentication → URL Configuration: add `http://localhost:3000/auth/callback` (and your deployed
   `/auth/callback`) to Redirect URLs.
4. A Google account gets in only after it has a role. Sign in once with Google (it is created without a role and
   turned away), then: `npm run db:provision -- --email you@gmail.com --role dispatcher` (no password needed for an
   existing account).

**Security model.** Roles live in Supabase `app_metadata` (only the service role can set them). Page reads use the
signed-in user's session, so Postgres row-level security decides what each agent or dispatcher sees. The server
pipeline writes with the service role through transactional SQL functions, after checking the user. The proxy only
refreshes sessions and redirects; it is not the security boundary.

## API

| Endpoint | Who | Purpose |
|---|---|---|
| `POST /api/reports` | agent | multipart `audio`, `language` (`hi` \| `en` \| `hi-en`), `durationMs?`, `mockTranscript?` (mock STT only). Streams NDJSON stage events, then the result. |
| `GET /api/reports` | agent | The agent's own reports |
| `GET /api/reports/:id` | agent (own) / dispatcher | One report |
| `GET /api/reports/:id/recording` | agent (own) / dispatcher | The original recording (evidence) |
| `GET /api/reports/:id/prompt-audio` | agent (own) / dispatcher | Synthesized confirmation / clarification |
| `POST /api/reports/:id/edit` | agent (own) | JSON `{ orderReference?, requestedAction?, notes? }` — re-verified |
| `POST /api/reports/:id/confirm` | agent (own) | The only path to an operational change |
| `POST /api/reports/:id/reject` | agent (own) | Discard; nothing changes |
| `POST /api/reports/:id/spoken-reply` | agent (own) | multipart `audio`, `language`, `durationMs` — Prisma transcribes the reply; a clear yes confirms, a clear no rejects, anything else changes nothing. Returns `{ decision, heard, report }` |
| `POST /api/lab/samples` | dispatcher | multipart labelled clip: `audio`, `title`, `language`, `accent`, `noise`, `durationMs`, `reference?`, `expectedOrder?`, `expectedIssue?`, `expectedAction?`, `expectsClarification` |
| `GET /api/lab/samples/:id/audio` | dispatcher | Stored sample audio |
| `POST /api/lab/runs` | dispatcher | Benchmark every stored sample through Prisma → reasoning → verification. Streams NDJSON progress. Refuses on mock STT |
| `GET /api/system/status` | anyone | Active providers and whether they are simulated |

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm test` | Vitest: unit, pipeline, provider-contract and database tests (Postgres via PGlite) |
| `npm run db:seed:generate` | Regenerate `supabase/seed.sql` from the demo fixtures |
| `npm run db:migrate` | Apply pending migrations to `SUPABASE_DB_URL` (`-- --seed` also loads demo data once) |
| `npm run db:provision` | Create/update a user and set their role (see above) |
