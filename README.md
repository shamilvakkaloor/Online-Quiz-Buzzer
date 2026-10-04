# Buzzer

A complete local quiz workspace and Supabase-backed Next.js application based on the supplied **Online Quiz Buzzer V1 — Revision 2** architecture. Built with Next.js 16, React 19, TypeScript, Tailwind CSS, Supabase and PostgreSQL functions.

## Run locally

Requires Node.js 22 or newer.

```sh
npm ci
npm run dev
```

Open **http://localhost:3000**. With no Supabase environment configured, development uses a clearly labelled practice workspace. It runs **the actual PostgreSQL migrations and functions** inside PGlite, stored in `.local/quiz-db`; this is not a browser mock. Data survives server restarts. Use one process for the local database.

The home page opens as the practice quizmaster. Eight fictional teams and eighteen questions are included. Other roles use their own browser identity and can be tested in separate tabs.

| Screen       | URL            | Practice access                           |
| ------------ | -------------- | ----------------------------------------- |
| Quizmaster   | `/quizmaster`  | Automatic, or `FRIDAY` / `quizmaster2026` |
| Participant  | `/join`        | `BRAINWAV` for The Brainwaves             |
| Score keeper | `/scorekeeper` | `SCOREFRD`                                |
| Audience     | `/audience`    | `WATCHFRD`                                |
| Owner        | `/admin`       | Automatic in practice mode only           |

Join screens include **Fill in practice details**. Other participant codes and QR links are under **Participants**. A participant code grants control of that participant; keep individual codes private. Open joining must first be enabled under Settings.

To preview an optimized local build in PowerShell:

```powershell
npm run build
$env:DEMO_MODE='true'
npm start
```

Production defaults to **practice mode disabled**, even if Supabase credentials are absent. Never deploy with `DEMO_MODE=true`: practice mode intentionally grants local owner and quizmaster access.

## What is included

- Owner login, quiz creation, password rotation, session revocation, complete history JSON and results CSV export.
- Named quizmasters, participant codes / QR, open join and explicit takeover approval, scorekeeper access and read-only audience access.
- Rounds, optional subrounds, sequential questions, skip / complete, and independent scoring overrides at every level.
- Database-authoritative buzz order, duplicate-safe retries, stale-session rejection, one active participant device, record limits and automatic locks.
- Version-checked live commands, lock / reopen, pause / resume, absolute server timer with measured client clock offset.
- Decimal and negative scores, revision checking, permanent score revisions and audit history.
- Manual and milestone-based leaderboard reveals; hidden data is filtered on the server.
- Private realtime broadcasts, per-member private Presence channels, periodic state recovery and member activity heartbeats.
- Server-only service credentials, locally verified JWTs, scrypt password hashing, Zod validation and database-backed per-identity / per-code rate limits.
- Responsive host, participant, scorekeeper and audience interfaces; optional sound, haptics, QR codes and fullscreen audience display.

## Connect Supabase

Use a fresh dedicated Supabase project. The migrations are initial migrations, not idempotent reset scripts.

1. Apply `database/migrations/001_core.sql`, `002_snapshots.sql`, `003_supabase_security.sql`, `004_signup_hook.sql`, and `20261003151234_private_realtime_authorization.sql` **in order** using the Supabase SQL editor or your migration runner. The last three are Supabase-only; practice mode uses the first two. Realtime authorization helpers live in the unexposed `quiz_private` schema.
2. Create the owner’s email/password Auth user in the dashboard **before enabling the signup hook**. Add the owner's Auth UUID:

   ```sql
   insert into public.admin_users(user_id) values ('YOUR-AUTH-USER-UUID');
   ```

3. Enable anonymous sign-ins. Configure the **Before User Created** Auth hook to `public.before_quiz_user_created`. This permits anonymous identities but rejects public permanent-account registration. Do not blindly disable all user creation: anonymous sign-in also needs to create users. There is no public account-registration UI. The `admin_users` allow-list remains the authority for owner permissions.
4. Use an asymmetric **ES256 or RS256** Auth signing key. The server verifies tokens using Supabase's cached public JWKS. Legacy HS256 user access tokens are intentionally not accepted.
5. Disable **Allow public access** in Realtime settings. Do not add the private game tables to a public database-changes channel. Only private server broadcasts are used.
6. Enable Cloudflare Turnstile in Supabase Auth for abuse protection, configure its secret there, and set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` in the app. The join form passes its token to Supabase. Leave the app variable empty only when Supabase CAPTCHA is also disabled.
7. Copy `.env.example` to `.env.local` and set:

   ```dotenv
   DEMO_MODE=false
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-PUBLIC-KEY
   SUPABASE_SERVICE_ROLE_KEY=YOUR-SERVICE-ROLE-KEY
   NEXT_PUBLIC_TURNSTILE_SITE_KEY=YOUR-PUBLIC-TURNSTILE-KEY
   ```

   The service-role key must never have a `NEXT_PUBLIC_` prefix. No secrets are committed. The application’s `/api/config` exposes only public configuration.

8. Start the app, sign into `/admin`, create a quiz, and use its credentials at `/quizmaster` to configure it.

Supabase anonymous-auth limits can apply **per IP**, independently of this app’s per-member limits. Configure the project quota for a venue where 50 participants and staff share one public IP, and verify with a rehearsal. See the official [anonymous sign-in guidance](https://supabase.com/docs/guides/auth/auth-anonymous), [Auth hook documentation](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook), and [private realtime authorization documentation](https://supabase.com/docs/guides/realtime/authorization).

## Hostinger deployment

The app uses standard `npm run build` and `npm start` on a Node.js web-app plan. Configure the environment above in Hostinger and deploy the repository with its included lockfile. Use **one Node instance** for V1 because the snapshot throttle is process-local. The production database remains Supabase; PGlite is only for local practice and tests.

Set the build command to `npm run build`, the start command to `npm start`, and use Node 22+. The `database/` directory is required at runtime only for practice mode. Production requires no local writable database, native password-hashing add-on, or WebSocket server.

Check `/api/health`, HTTPS, and `Cache-Control: no-store` on all API and live routes. Configure the CDN to bypass these routes. The app supplies no-store headers; the hosting/CDN configuration must honor them. Test burst POSTs from the venue Wi-Fi against the actual WAF. Keep backups and export results after each event.

**Deployment has not been performed.** No Supabase project, Hostinger account, public URL or production credentials were supplied. Real Auth, Realtime connectivity, venue latency, hosting quotas, and WAF behavior require the deployment rehearsal below.

## Tests and rehearsal

```sh
npm test
npm run typecheck
npm run build
```

The SQL integration suite runs the real functions in ephemeral PostgreSQL via PGlite. It checks simultaneous calls, contiguous ranks, recording caps, retries, stale sessions, pause and timer locks, role boundaries, conflicting commands, takeover revocation, scoring inheritance, score revisions and display filtering. Security tests apply the actual Supabase policy migration against compatible Auth/Realtime schema stubs and exercise database privileges and topic authorization.

PGlite queues work on one embedded connection. These tests establish deterministic behavior, not deployed multi-connection throughput or live Supabase socket behavior.

For the Phase 0 / pre-event rehearsal, create a **dedicated disposable quiz**, add 50 participants and at least 20 questions, disable count-based auto-lock, and set the record limit to 50. Join its participants in advance and prepare a local ignored JSON file containing `[{"token":"PARTICIPANT_ACCESS_TOKEN"}, ...]` for all 50 identities. Provide the quizmaster’s token and the UUID of that same quiz:

```powershell
$env:LOAD_BASE_URL='https://YOUR-REHEARSAL-APP'
$env:LOAD_QUIZ_ID='QUIZ-UUID'
$env:LOAD_HOST_TOKEN='QUIZMASTER-ACCESS-TOKEN'
$env:LOAD_ROSTER_FILE='.local/rehearsal-roster.json'
npm run test:load
```

The script runs 20 questions with 60 requests per question (50 unique members plus duplicate retries), checks contiguous official ranks and recovery, and writes median / p95 / maximum latency to `rehearsal-results.json`. It changes that quiz's state; do not use a live event. It never prints tokens. Tokens must remain valid for the run.

Before a real event:

- Test private staff/display channel boundaries and rejected client publishing with real Supabase sockets.
- Revoke a connected device and verify it receives no future game snapshots.
- Exercise admin creation, named quizmasters, all join paths, QR scanning and takeover approval.
- Buzz together from the venue network; pause, resume, expire the timer, reopen, and reconnect.
- Confirm decimal scoring, revision history, hidden/revealed leaderboard and export.
- Restart Hostinger during rehearsal and verify persistent quiz state and reconnect recovery.
- Check anonymous-auth quotas, Realtime quotas, regional latency, backups, HTTPS and CDN/WAF behavior.

## Implementation details and deliberate refinements

- Every mutation locks `quiz_live_state` **before** membership/session rows. `record_buzz` also locks the buzzer-session row. This uniform lock order avoids deadlock between commands, revocation, timers and buzzes.
- Channels are `quiz:<quiz UUID>:<epoch>:staff` and `...:display`. Revoking membership advances the epoch. Supabase authorizes sockets on subscription; a membership policy alone cannot stop an already subscribed socket receiving later messages. Publishing only to the current epoch closes that gap. Authorized screens recover and resubscribe; revoked screens get an explicit session-ended view.
- Presence uses `...:presence:<member UUID>` so RLS can bind publishing to a member’s own topic. It does not trust a client-selected presence key on a shared topic. Connected labels use server-observed activity within 20 seconds as the fallback, and presence is never used to accept or rank a buzz.
- One role-filtered `STATE` snapshot carries the state/buzz/leaderboard sections together. Leading/trailing coalescing targets a 200 ms window per quiz. The staff broadcast omits access codes and membership administration; quizmasters fetch those through their authorized snapshot.
- Practice clients recover every 1.5 seconds; production clients also recover every 5 seconds to handle dropped messages and epoch changes. Own buzz results arrive immediately in the HTTP response.
- Quizmaster setup uses validated POST mutation payloads with an `operation` field for edits/deletes. The documented CRUD resource routes are available through the common route dispatcher. No client writes database tables.
- CSV output quotes fields and neutralizes spreadsheet-formula prefixes in untrusted participant names. Full audit, score revisions and historical buzz records are available in the owner’s JSON export.

## Project map

```text
src/app/                 Pages, global styles and API route dispatcher
src/components/          Role screens, live controls, setup, scoring and access UI
src/lib/                 Browser auth, recovery/realtime hook and Zod contracts
src/server/              DB adapter, local seed, JWT auth, passwords, broadcaster
src/types/               Shared typed snapshots
database/migrations/     PostgreSQL rules, role-filtered snapshots, RLS and Auth hook
tests/                   PostgreSQL engine and security integration tests
scripts/rehearsal.ts      Deployed HTTP concurrency/recovery rehearsal
```
