# The StudentMasterDB

Sunday School management for Mar Gregorios Orthodox Syrian Church (OSSAE, Thrissur Diocese).

Sunday School management: student database, classes, teacher logins, marks, attendance,
activities, reports, certificates and a public registration form.

Built with Next.js 16 (App Router), Supabase (Postgres + Auth + RLS), Tailwind + shadcn/ui.

> Status: **Phase 4** — all features are in place (registrations, students, classes, teachers,
> attendance, marks, activities, subjects & exams, report cards, reports, certificates with QR
> verification, promotion, settings). Full deployment guide and user guides arrive in Phase 5.

## 1. Requirements

- Node.js 22 or newer
- A free Supabase project (https://supabase.com)

## 2. Supabase setup

1. Create a new project at https://supabase.com/dashboard. Pick a region close to Kerala (e.g. Mumbai `ap-south-1`).
2. **Authentication → Sign In / Providers**: keep **Email** enabled and turn **off** "Allow new users to sign up".
   Staff accounts are created by the headmaster inside the app.
3. **SQL Editor → New query**: run each file in `supabase/migrations/` **in name order**
   (`20261118000000_init.sql`, then `20261119000000_phase4.sql`).
   (Or with the CLI: `npx supabase link --project-ref <ref>` then `npx supabase db push`.)
4. Optional, **development projects only**: run `supabase/seed.sql` the same way to load demo data
   (1 headmaster, 2 teachers, 3 classes, 10 students). All demo users have the password `ChangeMe!2026`:
   `headmaster@example.com`, `teacher1@example.com` (Class 1), `teacher2@example.com` (Class 2 and 3).
   **Never run the seed on your real project.**

## 3. Create the first headmaster (real project)

1. **Authentication → Users → Add user → Create new user**. Enter the headmaster's email and a strong
   password, and tick "Auto confirm user".
2. Copy the new user's **UID**, then run in the SQL Editor:

   ```sql
   insert into public.profiles (id, full_name, phone, role)
   values ('PASTE-UID-HERE', 'Headmaster Name', '9xxxxxxxxx', 'headmaster');
   ```

3. Sign in at `/login`. Everything else (teachers, classes, academic year) is managed in the app.

## 4. Environment variables

Copy `.env.example` to `.env.local` and fill in the values from **Project Settings → API Keys**:

| Variable | Where | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | public |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key (or legacy `anon`) | public |
| `SUPABASE_SECRET_KEY` | Secret key (or legacy `service_role`) | **server only, never share** |
| `NEXT_PUBLIC_SITE_URL` | Your site URL | used in certificate QR codes |
| `RATE_LIMIT_SALT` | any long random string | hashes visitor IPs |

## 5. Run locally

```bash
npm install        # also applies patches/ (see "PDF fonts" below)
npm run dev        # http://localhost:3000
```

Quality checks:

```bash
npm run lint
npm run typecheck
npm test           # unit tests + database/RLS tests (in-process Postgres, no Docker needed)
```

## Project layout

```
app/            routes: / (public), /login, /admin (headmaster), /teacher
actions/        server actions (validated with Zod, role re-checked on the server)
components/     ui/ (shadcn), layout/ (sidebar + mobile bottom nav)
lib/            supabase clients, auth helpers, validation, dates, pdf
proxy.ts        guards /admin and /teacher by role (Next 16's name for middleware)
supabase/       migrations/*.sql, seed.sql, config.toml
tests/          unit/ and db/ (migration + RLS tests on PGlite)
assets/fonts/   Noto Sans + Noto Sans Malayalam, embedded in PDFs
assets/brand/   church banner printed at the top of report cards and certificates
public/brand/   web copies of the banner and OSSAE logo (app/icon.png is the browser tab icon)
app/api/        PDF (report cards, certificates) and Excel export endpoints
patches/        fontkit fix for Malayalam PDF rendering
```

## Security model

- Every table has Row Level Security. `is_headmaster()` and `is_teacher_of(class_id)` decide access;
  teachers only ever see their own classes, enforced inside Postgres.
- The secret (service-role) key is used only in `lib/supabase/admin.ts`, which is marked `server-only`.
- Public visitors can only insert registrations (forced to `pending`) and call `verify_certificate()`,
  which returns just validity, type, date and student name.

## PDF fonts (Malayalam)

`@react-pdf/renderer` uses fontkit 2.0.4, which crashes on some Malayalam mark-positioning rules
(e.g. സ്). `patches/fontkit+2.0.4.patch` fixes this following the OpenType spec, and `patch-package`
applies it automatically after every `npm install` (locally and on Vercel).
