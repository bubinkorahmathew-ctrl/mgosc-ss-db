# The StudentMasterDB

Sunday School management for Mar Gregorios Orthodox Syrian Church (OSSAE, Thrissur Diocese):
student database, classes, staff logins, marks, attendance, activities, reports, certificates
and a public registration form.

Built with Next.js 16 (App Router), TiDB Cloud (MySQL), Tailwind + shadcn/ui.

## 1. Requirements

- Node.js 22 or newer
- A TiDB Cloud cluster (https://tidbcloud.com). Host the app in the same region as the cluster.

## 2. Database

Create a database (for example `studentmasterdb`, never `sys`) and run every file in
`tidb/migrations/` **in name order**, each once.

## 3. Environment variables

Copy `.env.example` to `.env.local`:

| Variable | Notes |
| --- | --- |
| `TIDB_HOST`, `TIDB_PORT`, `TIDB_USER`, `TIDB_PASSWORD`, `TIDB_DATABASE` | **server only, never share.** Anyone with these bypasses every permission |
| `NEXT_PUBLIC_SITE_URL` | your site URL, used in certificate QR codes |
| `RATE_LIMIT_SALT` | any long random string; hashes IPs and emails for rate limits |

## 4. Create the super admin

```bash
npm install
npm run super-admin
```

It asks for an email, name and password. Run it again to reset a forgotten super admin password.
All other accounts are created in the app.

## 5. Run

```bash
npm run dev        # http://localhost:3000
```

Checks:

```bash
npm run lint
npm run typecheck
npm test           # offline
npm run test:tidb  # about 25 minutes; creates and drops temporary databases on the cluster
```

## Who can do what

| | Super admin | Admin | Teacher |
| --- | --- | --- | --- |
| Admin accounts, user rights page, school settings, signature, menu icons | yes | - | - |
| Classes, teachers, exams, promotion, registrations | yes | yes | - |
| Add students (one by one or Excel bulk upload) | any class | any class | own classes |
| Edit, move or deactivate students | yes | yes | - |
| Attendance, marks, activities (incl. Excel bulk upload) | all | all | own classes |
| Issue or revoke certificates | yes | yes | - |
| View and download certificates, reports | all | all | own classes |

## Security model

- TiDB has no row level security and no triggers, so **`lib/db/policies.ts` and `lib/db/rules.ts`
  are the security boundary**. They deny by default.
- Pages and actions use `createClient()` from `lib/db/server.ts`, which applies those rules.
  `getDatabase()` applies none: keep it to `lib/authn`, `lib/branding.ts` and `lib/db/system.ts`,
  or pass it straight to a function that checks the caller itself.
- Passwords are scrypt hashes. Sessions live in the database, so sign-out, password reset and
  deactivation take effect immediately.
- Visitors can only submit a registration and verify a certificate number.

## Project layout

```
app/            routes: / (public), /login, /admin, /teacher, api/ (PDF, Excel, signature)
actions/        server actions (validated with Zod, role re-checked on the server)
components/     ui/ (shadcn), layout/ (sidebar + mobile bottom nav)
lib/db/         data layer: policies, rules, query client
lib/authn/      passwords, sessions, rate limit, accounts
proxy.ts        guards /admin and /teacher by role (Next 16's name for middleware)
tidb/           migrations
supabase/       the original Postgres rules, kept only as the reference tests/tidb compares against
tests/          unit/, db/ (the reference rules), tidb/
assets/         PDF fonts and banner
patches/        fontkit fix for Malayalam PDF rendering
```

In code and database, the role `headmaster` means admin; a super admin also has `profiles.is_super`.

## PDF fonts (Malayalam)

`@react-pdf/renderer` uses fontkit 2.0.4, which crashes on some Malayalam mark-positioning rules
(e.g. സ്). `patches/fontkit+2.0.4.patch` fixes this following the OpenType spec, and `patch-package`
applies it automatically after every `npm install`.
