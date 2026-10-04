from fastapi import APIRouter

from app.api.routes import (
    actions, ai, analytics, audit_log, auth, checklists, departments, emergency, hazards, incidents, knowledge, people, ppe,
    risk, search, system, training, users, wellbeing, workspace,
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
api_router.include_router(risk.router)
api_router.include_router(wellbeing.router)
api_router.include_router(training.router)
api_router.include_router(ppe.router)
api_router.include_router(checklists.router)
api_router.include_router(analytics.router)
api_router.include_router(knowledge.router)
api_router.include_router(departments.router)
api_router.include_router(ai.router)
