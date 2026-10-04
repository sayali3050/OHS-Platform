# SafeOps: AI-Powered Occupational Health & Safety Platform

Final-year engineering project: **Occupational Health and Safety: Reducing Drudgery and Enhancing Worker Safety**.

SafeOps lets workers report hazards and incidents from their phones in their own language, helps supervisors investigate and close them, and gives administrators a clear picture of risk, compliance and physical workload (drudgery) across the organisation. AI assists with structuring reports, classifying hazards and suggesting controls. It never replaces human judgement, and every AI output is labelled as a suggestion.

> **Build status: all 10 phases complete.** Reporting, workflow and CAPA, AI assistance, risk and drudgery, training/PPE/checklists, analytics, company knowledge base, security hardening and documentation.
>
> - [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): design and phase plan
> - [docs/PROJECT_REPORT.md](docs/PROJECT_REPORT.md): diagrams, test cases and results for the written report
> - [docs/DEMO.md](docs/DEMO.md): a 15-minute demo script

## Problem statement

Many workplaces still track safety on paper or spreadsheets. Workers who are uncomfortable writing English reports under-report near misses, supervisors find out about hazards after someone is hurt, and repetitive physical strain is rarely measured at all. SafeOps aims to make reporting effortless, make follow-up accountable, and make both risk and drudgery visible before they turn into injuries.

## Objectives

1. Let any worker report a hazard or incident in under a minute, by text or voice, in English, Hindi, Marathi or German.
2. Track every report through a defined workflow to verified closure with corrective and preventive actions.
3. Quantify risk (likelihood × severity) and drudgery (a configurable multi-factor score) consistently.
4. Use AI to reduce effort (structuring, classifying, summarising) while keeping humans responsible for decisions.
5. Give supervisors and administrators trends, compliance and hotspots from real data.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite 6, Tailwind CSS, shadcn-style components (Radix Slot + CVA), Lucide, Framer Motion, Sonner |
| Backend | Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2, Alembic |
| Database | PostgreSQL 16 |
| Auth | JWT (PyJWT), bcrypt, role-based access control |
| AI | OpenAI API (chat + embeddings) behind a provider abstraction, with an offline Demo AI Mode; company-document search (BM25 + vectors) in PostgreSQL |
| Infra | Docker, Docker Compose, nginx |

## Quick start (Docker)

```bash
cp .env.example .env        # then set JWT_SECRET_KEY (and OPENAI_API_KEY if you have one)
docker compose up --build
```

- App: http://localhost:8080
- API docs (Swagger): http://localhost:8000/api/docs

On startup the API container runs migrations and seeds demo data automatically.

### Updating an existing install

After getting new code (for example, moving from Phase 1 to Phase 2):

```bash
docker compose up --build -d          # rebuilds both images; your database and uploaded photos are kept
```

The seed only adds demo history to empty tables, so restarts never duplicate data. To start again from a clean
demo, run `docker compose down -v` first. **This deletes the database and all uploaded photos.**

If you also run the backend outside Docker, reinstall its packages after updating (Phase 2 added Pillow for photos,
Phase 8 added pypdf for company documents):

```bash
cd backend
pip install -r requirements-dev.txt
```

## Running locally without Docker

```bash
# Database only
docker compose up -d db

# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
# Uses the same root .env as Docker; only the database address changes, because outside Docker it's localhost:
export DATABASE_URL=postgresql+psycopg://ohs:ohs@localhost:5432/ohs   # PowerShell: $env:DATABASE_URL="..."
alembic upgrade head
python -m app.seed
uvicorn app.main:app --reload

# Frontend (new terminal)
cd frontend
npm install
npm run dev                  # http://localhost:5173, proxies /api to :8000
```

## Demo accounts

All seeded accounts use the password set in `DEMO_PASSWORD` (default **`Demo@1234`**). The login page has one-click buttons that fill these in.

| Role | Email |
|---|---|
| Admin | admin@demo.com |
| Supervisor | supervisor@demo.com |
| Worker | worker@demo.com |

The seed also creates 33 more workers (`worker02@demo.com` … `worker34@demo.com`), one supervisor per department, 6 departments with 16 locations, 8 PPE types and 8 training courses. Phase 2 adds six months of history: 24 incidents, 26 hazards (3 anonymous), 19 corrective actions, PPE issued to every worker and training records. **All seeded data is synthetic** and the app shows a "Demo data" badge while it's present.

The demo worker's dashboard tells a deliberate story: safety score **93**, the equal average of PPE 80% (their gloves are 12 days past replacement), mandatory training 100% and daily checklists 100%.

## Using SafeOps for real (your own site)

The demo accounts share a published password, so a real site runs without them:

1. In `.env` set `SEED_DEMO_DATA=false`, a strong `JWT_SECRET_KEY`, and the first administrator:
   `ADMIN_EMAIL=you@yourcompany.com`, `ADMIN_PASSWORD=<a temporary password>`, `ADMIN_NAME=<your name>`.
   Set `APP_URL` to the address people will open (for example `http://192.168.0.100:8080`).
2. Start from an empty database: `docker compose down -v && docker compose up --build -d`. **This deletes the demo data.**
3. Sign in as the administrator. You're asked to choose your own password first.
4. Add your **departments** (menu → **Departments**), then optionally your site emergency numbers and SOPs.
5. People join in one of two ways:
   - **They register themselves** at *Create an account*. Workers can sign in straight away; supervisor accounts wait for an admin to approve them in *People & access*.
   - **An admin or supervisor adds them** (Profile → **My workers** for supervisors, **Supervisors & workers** for admins). The password you choose is temporary: they must pick their own at first sign-in.
6. **Forgotten passwords**: with a mail server (`SMTP_*` settings) people get a reset link by email. Without one, or for people without email, a supervisor or admin opens their profile and presses **Reset password** to get a one-time temporary password.

Every password field has an eye button to show what you typed. Someone with a temporary password can't open anything else until they change it, except **emergency mode**, which is never blocked.
With `ENVIRONMENT=production` the API refuses to start if demo data is switched on or the JWT secret is weak.

## Environment variables

See [`.env.example`](.env.example). The important ones:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | SQLAlchemy URL for PostgreSQL |
| `JWT_SECRET_KEY` | Signing key for tokens. Must be long and random outside development. |
| `OPENAI_API_KEY` | Optional. Empty means Demo AI Mode (no external calls, clearly labelled). |
| `DEMO_PASSWORD` | Password for all seeded demo users |
| `CORS_ORIGINS` | Comma-separated allowed origins |
| `EMERGENCY_CONTACTS` | Real site numbers for emergency mode, e.g. `Site security:+91 20 5555 0100;First-aid room:2222`. Empty means the screen says none are configured; it never shows a made-up number. |
| `PUBLIC_EMERGENCY_NUMBERS` | National numbers shown to everyone, as `service:number` pairs. Defaults to India's 112, police 100, fire 101, ambulance 108. |
| `MAX_UPLOAD_MB` | Per-photo limit (default 10). Up to 3 photos per report. |
| `MAX_VOICE_MB` | Voice-note limit (default 8, about 5 minutes). One voice note per report. |
| `DRUDGERY_WEIGHTS` | Optional JSON of factor weights, e.g. `{"load":0.3}`. Factors you don't name keep their defaults. |
| `ENVIRONMENT` | `production` or `staging` makes the API refuse to start with a default or short `JWT_SECRET_KEY`, or with demo data on. |
| `SEED_DEMO_DATA` | `true` (default) seeds the demo organisation; `false` for a real site (see above). |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | First administrator on a real site, created once; must change the password at first sign-in. |
| `APP_URL` | Public address used in password-reset links. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Optional mail server for reset emails. Without it the link goes to the API log. |

## Tests

```bash
cd backend && python -m pytest -q     # 277 tests: auth, RBAC, temporary passwords, every route needs sign-in, reporting, uploads, alarm, CAPA, scoring, training, analytics, knowledge base, AI validation
cd frontend && npm test               # 28 tests: guards, forms, password show/hide, alarm and siren, voice recorder, CAPA, board, translation parity, CSP hash, axe accessibility
```

Backend tests run against SQLite for speed using the same models; all five migrations have been verified on PostgreSQL 16 (upgrade, full downgrade, upgrade), and every phase was checked end to end on PostgreSQL through nginx. Lighthouse accessibility scores 100 on every screen, in light and dark theme. Test cases and results are tabulated in [docs/PROJECT_REPORT.md](docs/PROJECT_REPORT.md#12-testing).

For manual testing, [`api-tests.http`](api-tests.http) has ready-made requests for every Phase 2 endpoint, including security checks. It runs with the VS Code **REST Client** extension. You can also use the Swagger page at http://localhost:8000/api/docs.

## Project structure

```
ohs-platform/
├── backend/
│   ├── app/
│   │   ├── api/routes/      # thin HTTP layer: validation + permissions
│   │   ├── auth/            # password hashing, JWT, role guards
│   │   ├── core/            # settings
│   │   ├── database/        # engine, session, declarative base
│   │   ├── models/          # 35 SQLAlchemy tables
│   │   ├── schemas/         # Pydantic request/response models
│   │   ├── services/        # business logic, audit logging
│   │   ├── ai/              # provider, prompts, schemas, guardrails, demo mode
│   │   ├── utils/           # rate limiting, language detection
│   │   ├── seed.py          # idempotent demo data
│   │   └── main.py
│   ├── alembic/             # migrations
│   └── tests/
├── frontend/src/
│   ├── components/          # ui/ design-system primitives, guards, dialogs
│   ├── layouts/  pages/  hooks/  services/  types/  utils/
├── docker/                  # Dockerfiles, nginx config
├── docs/                    # ARCHITECTURE, PROJECT_REPORT, DEMO, screenshots/
├── docker-compose.yml
└── .env.example
```

## What Phase 1 includes

- 30-table relational schema with named foreign keys, indexes and enum check constraints, in one Alembic migration
- Registration with role selection: workers are active immediately, supervisor accounts wait for admin approval, admin accounts can't be self-registered
- Login with "keep me signed in", forgot/reset password (single-use, 30-minute links), logout, profile and language preference
- Role-based access control enforced by the API and mirrored in the UI
- Audit log for logins, failed logins, registrations, profile and user changes
- Admin "People & access": search, filter, paginate, approve supervisors, deactivate accounts (with confirmation)
- Responsive shell with mobile navigation, dark/light theme, skip link, visible focus, 44px touch targets, reduced-motion support
- Header badges for Demo data and Demo AI mode

## What Phase 2 includes

- **Landing page** at `/` for visitors; signed-in users go straight to their home screen.
- **Worker dashboard**: three large quick actions (report hazard, report incident, emergency), an explainable safety score, PPE status, training status and recent reports.
- **Incident reporting**: title, what happened, type, severity, time, department and area, injury details, people involved, language, and up to 3 photos (camera or gallery).
- **Hazard reporting**: 12 category tiles, severity, location, photos, and an **anonymous** option that stores no identity: not on the hazard, the photos, the audit log or the notifications.
- **Secure photo upload**: the file's signature is checked (the name and declared type are ignored) and the image is fully decoded and re-encoded. Re-encoding strips EXIF data, including GPS location. Photos are stored under random keys, served only to people allowed to see the report, and size-limited. Large photos are shrunk on the phone before upload.
- **Visibility rules**, enforced by the API: workers see their own reports, supervisors see their department's, admins see everything. Reports outside your scope return 404, so IDs can't be probed.
- **Notifications**: department supervisors (and the reporter's own supervisor) are notified of every report. High and critical reports, and any injury, also go to admins. There is a header bell with unread count, mark-read and mark-all-read.
- **Emergency mode**: general first steps for six emergency types, one-tap calling of **configured** site numbers and the worker's real supervisor, and an instant critical alert to supervisors and admins. It is on every screen via the red header button.
- **Reports list and detail pages** for every role, with search, status and severity filters, pagination, a workflow progress view and evidence photos.
- **Supervisor home**: new incidents to review, open hazards, and the latest reports from their department. The admin overview gains a latest-reports panel.

## Additional features (beyond the original plan)

- **Write in any language, never asked which**: the language of a report or SafeAssist question is read from the text (English, Hindi, Marathi or German), and SafeAssist answers in it.
- **Voice notes** on incident and hazard reports and on emergency alerts, recorded on the phone and played back on the report page. Anonymous reporters are warned their voice may identify them.
- **Site-wide alarm**: an emergency alert sounds a siren, vibrates and takes over the screen on every signed-in phone, with a system notification when the app is in the background. Everyone answers "I'm safe" or "I need help"; supervisors and admins see the live roll call and end the alarm for everyone. Each alarm opens a critical incident so the cause is investigated and fixed.
- **Real emergency numbers**: national 112, police, fire and ambulance for everyone; site numbers managed by admins in the app; the worker's own supervisor.
- **Full profiles**: personal, employment and emergency-contact details, health checks (fitness, BP, vision, hearing, next due), previous records (reports, PPE, training, emergencies) and work history. Admins add and manage supervisors and workers; supervisors add and manage the workers in their department.
- **Department profiles**: activities, machinery, main hazards, required PPE, assembly and first-aid points, fire equipment, head, supervisors and live numbers.
- **Richer admin overview**: headline KPIs, a 6-month trend, open reports by severity, top hazards, PPE, training and health-check compliance, departments compared, active and recent emergencies, and AI/demo status.
- **Demo labels explain themselves**: tap the Demo data / Demo AI badges for what they mean and how to switch to a live model.

**Updating:** run `docker compose up --build -d`. The API applies migration 0002 and fills in demo profiles on start. If the app ever shows SafeAssist or reports failing with "Not Found", the containers are older than the code; rebuild them.

## What Phase 3 (Supervisor & admin) adds

- **Corrective and preventive actions (CAPA)** on every incident and hazard: what to do, the hierarchy-of-controls level, who owns it, due date and priority. Owners are notified, see everything in **Actions**, and complete each one with a short note; managers are told when it's done. Overdue status is worked out from the due date, never stored.
- **Workflow gates**: an incident can't go to verification until it has a corrective action and every one is complete; a hazard can't be marked controlled with open actions.
- **Incident board**: every open incident in its stage (reported → closed), with investigator, days open and late actions; red edges flag what needs attention.
- **Supervisor KPIs**: incidents waiting over 24 hours, overdue actions, actions due this week, average days to close, and incidents by stage.
- **Filters** on reports: type, department, date range and "assigned to me".
- **Global search** (header, or Ctrl+K): reports, people and departments, always within what you're allowed to see.
- **Audit log viewer** for admins: every sign-in, report and change, filterable by person, action and date.

## What Phase 4 (AI services) adds

- **5 Whys root-cause suggestions** on incidents, with contributing factors and actions ranked by the hierarchy of controls. Each action can be added with one click; the investigator records the cause in their own words.
- **Risk explanations, quiz drafts and the monthly summary** written by AI from figures the code computed. Every response is validated against a schema, and invalid output falls back safely.
- **Embeddings** (`text-embedding-3-small`) for company-document search when a key is set; Demo AI Mode covers all of it offline.

## What Phase 5 (Risk & drudgery) adds

- **Risk register**: 5×5 likelihood × severity, scored by the server (low / moderate / high / critical), with existing and recommended controls (hierarchy of controls), assessor and review date.
- **Ergonomics questionnaire** (load, lifts, postures, vibration, hours, discomfort) with a points-based score and practical recommendations. High discomfort always suggests a first aider first.
- **Drudgery assessment** of tasks on seven weighted factors (0–100), with interventions for the worst factors.
- **Daily wellbeing check-in** (sleep, fatigue, pain, stress); several high-fatigue days in a row flag a worker on the supervisor's **Workload & fatigue** screen.

## What Phase 6 (Training, PPE, checklists) adds

- **8 courses** with lessons and quizzes marked on the server (answers never reach the browser), mandatory courses, printable certificates, and AI quiz drafts that staff review before saving.
- **PPE**: what each worker has, inspections, replacement dates and overdue items; workers report damaged kit, supervisors issue and replace.
- **Daily checklists** with "not OK" notes on any item.
- The worker's **safety score** combines PPE, training and checklists equally and explains itself.

## What Phase 7 (Analytics & reports) adds

- **Insights**: monthly trends, a rising-category signal and a location heatmap with numbers in every cell.
- **Ask the data**: a copilot that answers questions like "Which actions are overdue?" from real queries and lists its sources.
- **Monthly report** that prints to PDF, and **CSV exports** (incidents, hazards, actions, risks) protected against spreadsheet formula injection.

## What Phase 8 (Knowledge base) adds

- Admins upload **company SOPs and policies** (PDF, text or Markdown). They are split into sections and searched with BM25, plus vectors when live AI is on.
- **SafeAssist answers cite the document section** they used, with a link to it. If no document covers the question, the answer says so before giving general guidance.

## What Phase 9 (Hardening) adds

- A test calls **all 118 protected endpoints without a token** and expects 401; the API refuses to start in production with a weak secret.
- **Strict Content-Security-Policy** and security headers from nginx; the inline theme script is allowed only by its SHA-256 hash (checked by a test).
- **Accessibility**: axe tests and Lighthouse 100 on every screen; contrast tokens for both themes.
- **Performance**: non-English dictionaries load on demand and vendor code is split, cutting the main bundle from 748 KB to 200 KB.

## Screenshots

More screens are in [`docs/screenshots/`](docs/screenshots/); [docs/DEMO.md](docs/DEMO.md) walks through them in order.

| Worker dashboard | Site-wide alarm (phone) | Hindi (phone) |
|---|---|---|
| ![Worker dashboard](docs/screenshots/01-worker-dashboard.png) | ![Emergency alarm](docs/screenshots/09-emergency-alarm-phone.png) | ![Hindi dashboard](docs/screenshots/10-worker-dashboard-hindi-phone.png) |
| **Root cause and CAPA** | **Analytics heatmap** | **SafeAssist with citation** |
| ![Root cause](docs/screenshots/14-incident-root-cause-actions.png) | ![Heatmap](docs/screenshots/19-analytics-heatmap.png) | ![SafeAssist](docs/screenshots/07-safeassist-citation.png) |
| **Admin overview** | **Roll call** | **Workload & fatigue** |
| ![Admin overview](docs/screenshots/18-admin-overview.png) | ![Roll call](docs/screenshots/11-roll-call.png) | ![Workload](docs/screenshots/16-workload-fatigue.png) |

## Future enhancements

See [limitations and future work](docs/PROJECT_REPORT.md#14-limitations-and-future-work). In short: web push so the alarm reaches phones with the app closed, an offline-first PWA for poor connectivity, IoT sensor input (noise, gas, temperature), SSO, and SMS/WhatsApp alerts.
