"""Structured AI outputs. Every model response is parsed into one of these before it is used or stored.

Length limits are enforced by validators rather than Field(max_length=...), because OpenAI structured outputs
reject string-length keywords in the JSON schema. The limits still apply to everything we store.
"""
from pydantic import BaseModel, Field, field_validator

from app.models.enums import HazardCategory, Severity
from app.schemas.reports import IncidentCategory


def _clip(v: str, n: int) -> str:
    v = (v or "").strip()
    return v if len(v) <= n else v[: n - 1].rstrip() + "…"


class _Suggestion(BaseModel):
    reasoning: str = Field(description="One or two short sentences in the user's language")
    keywords: list[str] = Field(description="Words from the description that led to this choice")

    @field_validator("reasoning")
    @classmethod
    def short_reason(cls, v: str) -> str:
        return _clip(v, 600)

    @field_validator("keywords")
    @classmethod
    def few_keywords(cls, v: list[str]) -> list[str]:
        return [_clip(k, 40) for k in v if k.strip()][:8]


class HazardSuggestion(_Suggestion):
    category: HazardCategory
    severity: Severity


class IncidentSuggestion(_Suggestion):
    title: str = Field(description="Short factual title in the user's language")
    category: IncidentCategory
    severity: Severity
    injury_likely: bool

    @field_validator("title")
    @classmethod
    def short_title(cls, v: str) -> str:
        v = _clip(v, 120)
        if len(v) < 5:
            raise ValueError("title too short")
        return v


class Translation(BaseModel):
    english: str = Field(description="Faithful English translation; keep names, numbers and places unchanged")


class AssistAnswer(BaseModel):
    answer: str

    @field_validator("answer")
    @classmethod
    def short_answer(cls, v: str) -> str:
        return _clip(v, 2000)
