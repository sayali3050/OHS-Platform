# SafeOps: AI-Powered Occupational Health & Safety Platform

Final-year engineering project: **Occupational Health and Safety: Reducing Drudgery and Enhancing Worker Safety**.

SafeOps lets workers report hazards and incidents from their phones in their own language, helps supervisors investigate and close them, and gives administrators a clear picture of risk, compliance and physical workload (drudgery) across the organisation. AI assists with structuring reports, classifying hazards and suggesting controls. It never replaces human judgement, and every AI output is labelled as a suggestion.

> **Build status: Phase 1 of 10 complete** (foundation: architecture, database, authentication, access control). See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full plan and what each phase delivers.

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

## Running locally without Docker

```bash
# Database only
docker compose up -d db

# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp ../.env.example .env     # set DATABASE_URL=postgresql+psycopg://ohs:ohs@localhost:5432/ohs
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

The seed also creates 33 more workers (`worker02@demo.com` … `worker34@demo.com`), one supervisor per department, 6 departments with 16 locations, 8 PPE types and 8 training courses. **All seeded data is synthetic** and the app shows a "Demo data" badge while it's present.

## Environment variables

See [`.env.example`](.env.example). The important ones:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | SQLAlchemy URL for PostgreSQL |
| `JWT_SECRET_KEY` | Signing key for tokens. Must be long and random outside development. |
| `OPENAI_API_KEY` | Optional. Empty means Demo AI Mode (no external calls, clearly labelled). |
| `DEMO_PASSWORD` | Password for all seeded demo users |
| `CORS_ORIGINS` | Comma-separated allowed origins |

## Tests

```bash
cd backend && python -m pytest -q     # 22 tests: auth, registration, RBAC, rate limiting, password reset, audit
cd frontend && npm test               # route guards, accessible form errors, component behaviour
```

Backend tests run against SQLite for speed using the same models; the migrations themselves have been verified on PostgreSQL 16 (upgrade, full downgrade, upgrade).

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

## Screenshots

_Add screenshots to `docs/screenshots/` as phases are completed._

## Future enhancements

See phases 2–10 in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#6-implementation-plan). Beyond the current scope: offline-first PWA for areas with poor connectivity, IoT sensor ingestion (noise, gas, temperature), SSO, and an email/SMS gateway for notifications.
