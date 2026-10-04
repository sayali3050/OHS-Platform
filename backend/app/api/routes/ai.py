from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai import service as ai
from app.ai.schemas import HazardSuggestion, IncidentSuggestion
from app.auth.deps import get_current_user
from app.core.config import get_settings
from app.database.session import get_db
from app.models import AIConversation, User
from app.models.enums import Language
from app.services import audit
from app.utils.langdetect import detect_language
from app.utils.rate_limit import SlidingWindowLimiter, per_user_limit

router = APIRouter(prefix="/ai", tags=["AI (SafeAssist)"])
ai_limiter = SlidingWindowLimiter(limit=get_settings().ai_rate_limit_per_minute, window_seconds=60)


class AssistIn(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    conversation_id: int | None = None
    language: Language | None = None


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    role: str
    content: str
    classification: str | None
    demo_mode: bool
    created_at: datetime


class AssistOut(BaseModel):
    conversation_id: int
    title: str
    reply: MessageOut


class ConversationSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    updated_at: datetime


class ConversationOut(ConversationSummary):
    messages: list[MessageOut]


class DescribeIn(BaseModel):
    description: str = Field(min_length=10, max_length=5000)
    language: Language | None = None


class HazardSuggestionOut(HazardSuggestion):
    demo_mode: bool


class IncidentSuggestionOut(IncidentSuggestion):
    demo_mode: bool


@router.get("/status", summary="Whether AI runs live or in Demo AI Mode")
def ai_status(_: User = Depends(get_current_user)):
    mode = ai.mode()
    return {"mode": mode, "model": get_settings().openai_model if mode == "live" else None}


@router.post("/assist", response_model=AssistOut,
             summary="Ask SafeAssist. Emergencies and medical concerns are detected in code before any AI answer.")
def assist(body: AssistIn, request: Request, user: User = Depends(per_user_limit(ai_limiter)),
           db: Session = Depends(get_db)):
    try:
        # Answer in the language the question was written in, whatever the app is set to.
        lang = detect_language(body.message) or body.language
        convo, reply = ai.assist(db, user, body.message.strip(), body.conversation_id, lang)
    except LookupError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    if reply.classification == "emergency":
        audit.record(db, "ai.emergency_detected", user_id=user.id, entity_type="ai_conversation", entity_id=convo.id,
                     request=request)
    db.commit()
    return AssistOut(conversation_id=convo.id, title=convo.title, reply=MessageOut.model_validate(reply))


@router.get("/conversations", response_model=list[ConversationSummary])
def conversations(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.scalars(select(AIConversation).where(AIConversation.user_id == user.id)
                      .order_by(AIConversation.updated_at.desc()).limit(30)).all()


def _own(db: Session, conversation_id: int, user: User) -> AIConversation:
    convo = db.get(AIConversation, conversation_id)
    if convo is None or convo.user_id != user.id:  # other people's chats are private, admins included
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    return convo


@router.get("/conversations/{conversation_id}", response_model=ConversationOut)
def conversation(conversation_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _own(db, conversation_id, user)


@router.delete("/conversations/{conversation_id}", status_code=204)
def delete_conversation(conversation_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(_own(db, conversation_id, user))
    db.commit()


@router.post("/suggest/hazard", response_model=HazardSuggestionOut,
             summary="Suggest category and severity from a hazard description (a suggestion for the worker to check)")
def suggest_hazard(body: DescribeIn, user: User = Depends(per_user_limit(ai_limiter))):
    s, demo = ai.suggest_hazard(body.description,
                                detect_language(body.description) or body.language or user.preferred_language)
    return HazardSuggestionOut(**s.model_dump(), demo_mode=demo)


@router.post("/suggest/incident", response_model=IncidentSuggestionOut,
             summary="Suggest title, type and severity from an incident description")
def suggest_incident(body: DescribeIn, user: User = Depends(per_user_limit(ai_limiter))):
    s, demo = ai.suggest_incident(body.description,
                                  detect_language(body.description) or body.language or user.preferred_language)
    return IncidentSuggestionOut(**s.model_dump(), demo_mode=demo)
