"""Structured AI outputs. Every model response is parsed into one of these before it is used or stored.

Length limits are enforced by validators rather than Field(max_length=...), because OpenAI structured outputs
reject string-length keywords in the JSON schema. The limits still apply to everything we store.
"""
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.models.enums import ControlLevel, HazardCategory, Severity
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


class Why(BaseModel):
    question: str = Field(description="'Why did ...?' asked about the previous answer")
    answer: str = Field(description="One factual, checkable answer")

    @field_validator("question", "answer")
    @classmethod
    def short(cls, v: str) -> str:
        return _clip(v, 300)


class SuggestedAction(BaseModel):
    description: str
    control_level: ControlLevel

    @field_validator("description")
    @classmethod
    def short(cls, v: str) -> str:
        return _clip(v, 300)


class RootCauseAnalysis(BaseModel):
    """5 Whys: a chain from what happened to a system cause. Always a suggestion for the investigator to verify."""
    whys: list[Why] = Field(description="3 to 5 steps, each asking why the previous answer happened")
    root_cause: str = Field(description="The underlying system cause (a process, design or management gap), not a person")
    contributing_factors: list[str]
    suggested_actions: list[SuggestedAction] = Field(description="Preferring elimination, substitution and engineering")
    confidence: Literal["low", "medium", "high"]

    @field_validator("whys")
    @classmethod
    def three_to_five(cls, v: list[Why]) -> list[Why]:
        if len(v) < 3:
            raise ValueError("a 5 Whys chain needs at least 3 steps")
        return v[:5]

    @field_validator("root_cause")
    @classmethod
    def short_root(cls, v: str) -> str:
        return _clip(v, 500)

    @field_validator("contributing_factors")
    @classmethod
    def few_factors(cls, v: list[str]) -> list[str]:
        return [_clip(x, 200) for x in v if x.strip()][:6]

    @field_validator("suggested_actions")
    @classmethod
    def few_actions(cls, v: list[SuggestedAction]) -> list[SuggestedAction]:
        return v[:5]


class QuizQuestionDraft(BaseModel):
    kind: Literal["mcq", "true_false", "scenario"]
    prompt: str
    options: list[str] = Field(description="2 options for true_false, otherwise 4")
    correct_index: int
    explanation: str = Field(description="One sentence on why the answer is right")

    @field_validator("prompt", "explanation")
    @classmethod
    def short(cls, v: str) -> str:
        return _clip(v, 400)

    @field_validator("options")
    @classmethod
    def two_to_four(cls, v: list[str]) -> list[str]:
        v = [_clip(o, 160) for o in v if o.strip()]
        if not 2 <= len(v) <= 4 or len(set(v)) != len(v):
            raise ValueError("a question needs 2 to 4 different options")
        return v

    def model_post_init(self, _ctx) -> None:
        if not 0 <= self.correct_index < len(self.options):
            raise ValueError("correct_index must point at one of the options")


class QuizDraft(BaseModel):
    questions: list[QuizQuestionDraft]

    @field_validator("questions")
    @classmethod
    def three_to_ten(cls, v: list[QuizQuestionDraft]) -> list[QuizQuestionDraft]:
        if not 3 <= len(v) <= 10:
            raise ValueError("a quiz needs 3 to 10 questions")
        return v
