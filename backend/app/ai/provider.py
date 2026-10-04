"""Provider abstraction: the rest of the app asks for structured output or a chat reply and never knows which
model (or no model) is behind it. With no OPENAI_API_KEY the deterministic Demo provider is used."""
from functools import lru_cache
from typing import Protocol, TypeVar

from pydantic import BaseModel

from app.core.config import get_settings

M = TypeVar("M", bound=BaseModel)


class AIError(RuntimeError):
    """The model call failed or returned something that didn't validate. Callers fall back safely."""


class LLMProvider(Protocol):
    demo: bool

    def structured(self, system: str, user: str, schema: type[M]) -> M: ...

    def chat(self, system: str, messages: list[dict[str, str]]) -> str: ...


@lru_cache
def get_provider() -> LLMProvider | None:
    """The live provider, or None in Demo AI Mode (the demo logic lives in app.ai.demo, not behind this protocol,
    because it needs the original task context rather than a prompt)."""
    settings = get_settings()
    if settings.ai_demo_mode:
        return None
    from app.ai.openai_provider import OpenAIProvider
    return OpenAIProvider(settings.openai_api_key, settings.openai_model)
