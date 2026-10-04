# SafeOps: AI-Powered Occupational Health & Safety Platform

Final-year engineering project: **Occupational Health and Safety: Reducing Drudgery and Enhancing Worker Safety**.

SafeOps lets workers report hazards and incidents from their phones in their own language, helps supervisors investigate and close them, and gives administrators a clear picture of risk, compliance and physical workload (drudgery) across the organisation. AI assists with structuring reports, classifying hazards and suggesting controls. It never replaces human judgement, and every AI output is labelled as a suggestion.

> **Build status: Phase 3 of 10 complete** (foundation; worker reporting; supervisor & admin workflow with corrective actions, incident board, KPIs, search and audit log). See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full plan and what each phase delivers.

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
| AI | OpenAI API behind a provider abstraction, with an offline Demo AI Mode |
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

If you also run the backend outside Docker, reinstall its packages once, because Phase 2 adds Pillow for photo
processing:

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

The demo worker's dashboard tells a deliberate story: safety score **90**, made up of PPE 80% (their gloves are 12 days past replacement) and mandatory training 100%.

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

## Tests

```bash
cd backend && python -m pytest -q     # 109 tests: auth, RBAC, reporting, anonymity, uploads and voice notes, language detection, alarm and roll call, profiles, departments, admin overview
cd frontend && npm test               # 18 tests: route guards, form validation, anonymous reporting, alarm and siren, voice recorder, profile permissions, CAPA, board, search
```

Backend tests run against SQLite for speed using the same models; the migrations themselves have been verified on PostgreSQL 16 (upgrade, full downgrade, upgrade). Phase 2 was also checked end to end on PostgreSQL through nginx.

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
│   │   ├── models/          # 30 SQLAlchemy tables
│   │   ├── schemas/         # Pydantic request/response models
│   │   ├── services/        # business logic, audit logging
│   │   ├── ai/              # AI layer (Phase 4)
│   │   ├── utils/           # rate limiting
│   │   ├── seed.py          # idempotent demo data
│   │   └── main.py
│   ├── alembic/             # migrations
│   └── tests/
├── frontend/src/
│   ├── components/          # ui/ design-system primitives, guards, dialogs
│   ├── layouts/  pages/  hooks/  services/  types/  utils/
├── docker/                  # Dockerfiles, nginx config
├── docs/ARCHITECTURE.md     # architecture, data model, AI design, phase plan
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

## Screenshots

_Add screenshots to `docs/screenshots/` as phases are completed._

## Future enhancements

See phases 2–10 in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#7-implementation-plan). Beyond the current scope: offline-first PWA for areas with poor connectivity, IoT sensor ingestion (noise, gas, temperature), SSO, and an email/SMS gateway for notifications.
