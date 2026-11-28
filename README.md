# The StudentMasterDB

Sunday School management for Mar Gregorios Orthodox Syrian Church (OSSAE, Thrissur Diocese):
students, classes, staff logins, attendance, marks, activities, report cards, toppers,
certificates (with QR verification), accounting (receipts, charity, vouchers, cash book), and a
public registration form.

Built with Next.js 16 (App Router), TiDB Cloud (MySQL) through Drizzle ORM, Auth.js v5,
Vercel Blob, Gmail SMTP (nodemailer), Tailwind + shadcn/ui. Hosted on Vercel.

## 1. Requirements

- Node.js 22 or newer
- A TiDB Cloud cluster (https://tidbcloud.com). This one is in **AWS Singapore (ap-southeast-1)**;
  keep the Vercel functions in the same region (Singapore, `sin1`).
- A Vercel account, and a Gmail account for sending email (with 2-Step Verification on).

## 2. Environment variables

Copy `.env.example` to `.env.local` for your computer; add the same names in Vercel under
**Project → Settings → Environment Variables** (Production and Preview). Never commit real values.

| Variable | What it is |
| --- | --- |
| `DATABASE_URL` | TiDB connection string: `mysql://USER:PASSWORD@HOST:4000/studentmasterdb` (never the `sys` database). **Anyone with it bypasses every permission.** |
| `AUTH_SECRET` | Random string (48+ characters): signs the sign-in cookie and keys the lockout tables. Generate with `npx auth secret`. Changing it signs everyone out. Use a different one in production. |
| `NEXT_PUBLIC_SITE_URL` | The site's address, e.g. `https://mgosc-ss-db.vercel.app` (certificate QR codes). |
| `BLOB_READ_WRITE_TOKEN` | Added by Vercel when you connect a Blob store (step 6). Optional on your computer: without it, signatures are kept in the database and bill upload is switched off. |
| `SMTP_HOST`, `SMTP_PORT` | `smtp.gmail.com`, `465` |
| `SMTP_USER` | the Gmail address, e.g. `mgosc.ssdb@gmail.com` |
| `SMTP_PASS` | a Gmail **App Password** (step 7), never the normal password |
| `EMAIL_FROM` | `"The StudentMasterDB <mgosc.ssdb@gmail.com>"` |
| `APP_URL` | base address for links in emails; falls back to `NEXT_PUBLIC_SITE_URL` |
| `SEED_HEADMASTER_EMAIL`, `_NAME`, `_PASSWORD` | optional, only to create the first super admin without a terminal (step 4); remove afterwards |

The build needs none of these: every page that reads the database or sends email does so when
someone opens it, never while building.

## 3. Database

```bash
npm install
npm run db:migrate      # creates or updates every table (migrations in db/migrations)
```

After changing `db/schema/*.ts`: `npm run db:generate` writes a new migration; review it, then
`npm run db:migrate`. Never edit a migration that has already run.

## 4. The first super admin

```bash
npm run super-admin
```

It asks for an email, name and password (typed hidden, at least 10 characters). Run it again to
reset a forgotten super admin password. Without a terminal (e.g. a deploy step) set
`SEED_HEADMASTER_EMAIL`, `SEED_HEADMASTER_NAME` and `SEED_HEADMASTER_PASSWORD`: it then only
creates the account, once. There is no default password anywhere. All other accounts are made in
the app (temporary passwords that must be changed at the first sign-in).

## 5. Run on your computer

```bash
npm run dev        # http://localhost:3000
```

Checks:

```bash
npm run lint
npm run typecheck
npm test           # offline unit tests
npm run test:tidb  # about 45 minutes; creates and drops temporary smdb_test_* databases on the cluster
```

## 6. Deploy on Vercel

1. **Import** the GitHub repository in Vercel (framework: Next.js). Every push to `main` deploys.
2. **Region:** Project → Settings → Functions → Region **Singapore (sin1)**, next to the database.
3. **Environment variables:** add those of step 2 (Production and Preview).
4. **Database:** run `npm run db:migrate` from your computer with `DATABASE_URL` pointing at the
   production database (the app never migrates by itself).
5. **File storage (Vercel Blob):** Project → Storage → Create → **Blob** → access **Private** →
   create, then **Connect** it to the project (Production and Preview). Vercel adds
   `BLOB_READ_WRITE_TOKEN` itself. Redeploy. Signatures uploaded from then on, and voucher bills,
   are stored there privately and only shown to signed-in staff.
6. **Email:** add the SMTP variables (step 7), redeploy.
7. Open the site and sign in as the super admin.

## 7. Gmail App Password (for email)

1. Sign in to the sending Gmail account → Google Account → **Security**.
2. Turn on **2-Step Verification** if it is off.
3. Search for **App passwords** → create one named "StudentMasterDB" → copy the 16 letters.
4. Put it in `SMTP_PASS` (no spaces). If it is ever exposed, delete it there and make a new one.

Free Gmail sends about 500 emails a day. The app only sends password reset links and a few
notifications (new registration → admins; new student in a class → that class's teachers), one
email per person. Each person can switch notifications off on their Account page.

## Who can do what

| | Super admin | Admin | Teacher | OVBS staff |
| --- | --- | --- | --- | --- |
| Admin accounts, school settings, signatures, menu icons, currency | yes | - | - | - |
| Make a teacher an admin, or an admin a teacher again | yes | - | - | - |
| Classes, teachers, exams, promotion, registrations | yes | yes | - | - |
| Add students (one by one or Excel upload) | any class | any class | own classes | - |
| Edit, move or deactivate students | yes | yes | - | - |
| Delete a student (permanently) | yes | - | - | - |
| Attendance, marks, activities | all | all | own classes (attendance 14 days back) | - |
| Issue or revoke certificates; confirm toppers; grade scale | yes | yes | - | - |
| View certificates, report cards, reports | all | all | own classes | - |
| Accounting: receipts, vouchers, events, cash book, reports | yes | yes | - | - |
| Charity collection | all classes | all classes | own class and themselves; sees only own entries | - |

OVBS staff accounts (role `ovbs_teacher`) exist for the coming OVBS module and see nothing else yet.
In code and database the role `headmaster` means admin; a super admin also has `profiles.is_super`.

## Security model

- **Only `lib/repo` reaches the data** (plus `lib/authn` for signing in). Every repo function takes
  the signed-in user first and checks the role; ESLint stops pages, components, server actions
  and route handlers from importing a database client.
- Underneath, `lib/db/policies.ts` and `lib/db/rules.ts` decide which rows each role may read and
  write (default deny) and enforce the data rules; the database adds CHECK constraints.
  `tests/tidb` checks every case, per role.
- Every server action validates its input with Zod and re-checks permissions.
- Sign-in: Auth.js (encrypted cookie) plus a database check on every request, so deactivation and
  password changes take effect at once. Passwords are bcrypt hashes (10+ characters). 5 wrong
  passwords from one device lock that account there for 15 minutes; wider limits per device and
  per account. "Forgot password" links are single-use, valid 1 hour, stored only as a SHA-256 hash.
- Public: the registration form (honeypot + rate limit), certificate verification, forgot/reset
  password. Nothing else is visible without signing in.
- Files (signatures, bills) are in a private Blob store and served only by role-checked routes.

## Project layout

```
app/            pages: / (public), /login, /forgot-password, /reset-password, /register, /verify,
                /admin, /teacher, /ovbs, api/ (PDF, Excel, files)
actions/        server actions (Zod-validated, role re-checked)
components/     ui/ (shadcn), layout/, accounts/, certificates/, ...
db/             Drizzle schema (db/schema) and migrations (db/migrations)
lib/repo/       the data access layer (user first)
lib/db/         the row policies and data rules underneath lib/repo
lib/authn/      sign-in, lockout, passwords, password reset, staff accounts
lib/email/      sending (Gmail SMTP), templates, notifications
lib/pdf/        certificates, report cards, receipts, vouchers, report tables
proxy.ts        guards /admin, /teacher and /ovbs by role (Next 16's middleware)
scripts/        super-admin seed
tests/          unit/ (offline), tidb/ (against temporary databases)
assets/, public/fonts/   PDF fonts and banners (shipped with the functions)
patches/        fontkit fix for Malayalam PDF rendering
```

## PDF fonts (Malayalam)

`@react-pdf/renderer` uses fontkit 2.0.4, which crashes on some Malayalam mark-positioning rules
(e.g. സ്). `patches/fontkit+2.0.4.patch` fixes this following the OpenType spec, and `patch-package`
applies it automatically after every `npm install`.
