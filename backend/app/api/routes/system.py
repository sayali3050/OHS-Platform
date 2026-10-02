from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.database.session import get_db

router = APIRouter(tags=["System"])
settings = get_settings()


@router.get("/health")
def health(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "ok"}


@router.get("/system/info", summary="Public runtime flags the UI needs (e.g. Demo AI Mode banner)")
def info():
    return {"app_name": settings.app_name, "environment": settings.environment,
            "ai_demo_mode": settings.ai_demo_mode, "demo_data": True}
