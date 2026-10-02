.PHONY: up down logs test test-backend test-frontend dev-api dev-web migrate seed
up:            ## Build and start everything (http://localhost:8080)
	docker compose up --build -d
down:
	docker compose down
logs:
	docker compose logs -f api
test: test-backend test-frontend
test-backend:
	cd backend && python -m pytest -q
test-frontend:
	cd frontend && npm test
dev-api:       ## Run the API locally against the compose database
	cd backend && DATABASE_URL=postgresql+psycopg://ohs:ohs@localhost:5432/ohs uvicorn app.main:app --reload
dev-web:
	cd frontend && npm run dev
migrate:
	cd backend && alembic upgrade head
seed:
	cd backend && python -m app.seed
