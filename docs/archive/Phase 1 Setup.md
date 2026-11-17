# Phase 1 Setup

Phase 1 implementation and automated QA complete; live Google sign-in pending user setup.

Phase 1.2 updates the same manual foundation. Current evidence, the one-time
verification reset, and the user's acceptance checklist are recorded in
`docs/Phase 1.2 Progress.md`; do not repeat a reset on new verification data.

This guide covers the manual foundation, authentication, SQLite, and local
runtime. Live Google sign-in requires your Cloud client setup below. Automated
QA evidence is in `docs/Phase 1 Progress.md`; it is not production certification.

## Requirements

- Node.js 22.12 or newer compatible with the locked dependencies, and npm.
- SQLite runs in the application process with `better-sqlite3` and Drizzle.
  Its native module may require a supported C++ build toolchain during install
  (Visual Studio C++ Build Tools on Windows, compiler/make/Python on Linux).
- A Google account and a Google OAuth Web application client for live sign-in.
  Automated tests do not need Google credentials.

## Environment

Copy `.env.example` to `.env` only if `.env` does not already exist.
Do not overwrite an existing environment or commit secrets.

Generate a persistent authentication secret:

```sh
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

| Variable | Local configuration | VPS configuration |
| --- | --- | --- |
| `BETTER_AUTH_URL` | `http://localhost:3000` | Your real HTTPS app origin, without a callback path |
| `BETTER_AUTH_SECRET` | Paste the generated secret; at least 32 characters | A strong persistent server-only secret; keep it across restarts |
| `GOOGLE_CLIENT_ID` | Google Web application client ID | The client registered for the real app origin/callback |
| `GOOGLE_CLIENT_SECRET` | Secret from that same Google client | Server-only; never use a `NEXT_PUBLIC_*` name |
| `DATABASE_URL` | `./data/relay.db` | An absolute persistent SQLite path, e.g. `/var/lib/relay/relay.db` |

The supplied local origin and SQLite path are usable defaults. You must fill
the authentication secret and both Google credentials to sign in. Missing
credentials display a setup message, never an alternate identity.

`DATABASE_URL` is a plain filesystem path, **not** `file:` or a database URL.
Relative paths resolve from the project working directory. The application
creates the parent directory when permitted; the service account needs read/write
access to that directory and SQLite's WAL/SHM sidecar files. Keep it outside
ephemeral releases on persistent VPS storage. Do not place it in `public/`.
Deployment permissions, backups, Cloudflare, and secret provisioning remain
separate deployment work.

## Google Cloud Configuration

1. Open [Google Cloud Console](https://console.cloud.google.com/) and select or
   create the intended project.
2. Open [OAuth consent configuration](https://console.cloud.google.com/apis/credentials/consent).
   Complete the app branding, audience, and contact settings. If the app is in
   testing mode, add the intended Google account under test users where required.
3. Open [OAuth credentials](https://console.cloud.google.com/apis/credentials)
   and create an **OAuth client ID** with application type **Web application**.
   Copy its client ID and secret into `.env`.
4. Register these exact values:

| Environment | JavaScript origin, if requested | Authorized redirect URI |
| --- | --- | --- |
| Local | `http://localhost:3000` | `http://localhost:3000/api/auth/callback/google` |
| Production | `https://<your-relay-domain>` | `https://<your-relay-domain>/api/auth/callback/google` |

An origin is only scheme, host, and optional port. The redirect URI includes
the `/api/auth/callback/google` path. Replace the production placeholder with
your actual domain; no production domain has been selected here. Changing
`BETTER_AUTH_URL` requires updating Google's registered origin/redirect too.
If you deliberately use another local hostname or port, register its matching
origin and callback instead; `localhost` and `127.0.0.1` are not interchangeable
OAuth registrations.

Only basic sign-in scopes are used: `openid`, `email`, `profile`. Do not enable
Calendar, Gmail, Drive permissions, or unrelated APIs for Relay. Better Auth
1.7.25's installed Google provider constructs the callback from the app origin
and the `/api/auth` mount; automated tests check this URL and scope list without
contacting Google.

Cloudflare email restrictions are a separate, user-managed inbound-access gate.
Relay still uses real Google sessions and server-side owner isolation, with no
additional app email allowlist. Origin protection and Cloudflare/VPS setup
must be verified before deployment.

References: [Better Auth Google](https://better-auth.com/docs/authentication/google),
[Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server).

## First Run

From the project root, after filling `.env`:

```sh
npm ci
npm run db:migrate
npm run dev
```

Open `http://localhost:3000`. The development server binds to loopback only.
For a local production-mode check:

```sh
npm run build
npm run start
```

The same local URL and environment apply. Do not publish or expose the app
before deployment/access/backup configuration has been addressed separately.

## Automated Checks

```sh
npm run typecheck
npm run lint
npm run test -- --run
npm run build
npm run test:e2e
```

Install the Playwright Chromium browser if it is not already available:
`npx playwright install chromium`.

Integration/browser tests create dedicated disposable SQLite databases and
test-only secrets, seed two real users/sessions through a separate Better Auth
`testUtils` instance, and keep ordinary production session validation active.
No HTTP test-login route or production auth bypass exists.
Browser tests bind to `http://127.0.0.1:3100`; stop any other process using that
port before running them. Do not point tests at deployed origins or your
ordinary SQLite database. Local test secrets/cookies are ignored artifacts;
do not share them.

To test a previously built production server, set `RELAY_TEST_SERVER=production`
for `npm run test:e2e` (PowerShell: `$env:RELAY_TEST_SERVER='production'`).
This setting belongs only to the test harness and does not bypass app auth.

## Manual Work And Recovery

- Home, Projects, Inbox, Calendar, Focus Mode, check-ins, dependencies, search
  (`Ctrl/Cmd+K`), Settings, and History work without AI configuration.
- Home's Create menu opens Task, Project, or Event. Navigation can collapse to
  an icon rail; its search remains inside navigation and available by shortcut.
- Importance and urgency are independent explicit choices. Missing either choice
  is Unclassified; deadlines do not set urgency. Home and Inbox offer matrices,
  with Inbox remaining limited to unassigned tasks.
- Add Task and quick capture save one task with exactly the entered title.
  Saving a check-in or completing a task never asks AI or creates follow-ups.
- Timed task deadlines accept an ISO-8601 instant with an explicit UTC offset
  and IANA timezone. Clear the date-only field before entering a timed deadline.
  Events use local date/time inputs and reject newly ambiguous DST times.
- Archive preserves child statuses. Deletion previews its exact cascade;
  independent events and independently deleted children are not included.
- Completing a project previews and completes unfinished children atomically.
  Already-Done children keep their completion times. Reopening or pausing the
  project does not rewrite children. Undo treats the completion as one operation.
- History keeps before/after states without expiry. Use its Deleted records
  view to restore a selected deletion, or Undo an ordinary mutation. The toast
  is only a shortcut. Recovery refuses later edits, unavailable parents, and
  invalid dependency graphs instead of overwriting work.
- Revisions always advance, including recovery. Undo is not a recursive
  version-control/redo stack: after recovering a later change, an older
  operation can remain stale. A creation with later children cannot be undone;
  use the normal previewed deletion instead. No permanent purge is provided.

AI, deployment, recurring backups, and origin/Cloudflare hardening remain
separate work. Only Chromium desktop and touch-mobile emulation are
automated here; no Firefox, Safari, physical-device, or independent-review
claim is made.

## Remaining Live Google Smoke Check

After Google client configuration:

1. Visit `http://localhost:3000/login` and choose **Continue with Google**.
2. Complete the real consent/sign-in flow. Confirm the callback returns to the
   protected workspace under the intended Google identity.
3. Refresh a protected page; confirm the session remains valid.
4. Sign out in Settings. Confirm protected pages redirect to login and a request
   to `/api/preferences` without a valid cookie returns `401`.
5. Repeat against the real HTTPS domain after separate deployment setup.

Local seeded sessions and a passing automated callback-construction test do
not verify Google's consent screen, client provisioning, or live callback
success. Track that smoke test separately from implementation/automated QA.
