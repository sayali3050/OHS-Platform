from fastapi import APIRouter

from app.api.routes import (
    actions, ai, audit_log, auth, departments, emergency, hazards, incidents, people, search, system, users, workspace,
)

api_router = APIRouter()
api_router.include_router(system.router)
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(incidents.router)
api_router.include_router(hazards.router)
api_router.include_router(workspace.router)
api_router.include_router(emergency.router)
api_router.include_router(people.router)
api_router.include_router(actions.router)
api_router.include_router(search.router)
api_router.include_router(audit_log.router)
api_router.include_router(departments.router)
api_router.include_router(ai.router)
