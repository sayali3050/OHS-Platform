import logging

from openai import OpenAI, OpenAIError
from pydantic import ValidationError

from app.ai.provider import M, AIError

log = logging.getLogger(__name__)


class OpenAIProvider:
    demo = False

    def __init__(self, api_key: str, model: str):
        self.model = model
        self.client = OpenAI(api_key=api_key, timeout=20, max_retries=1)

    def structured(self, system: str, user: str, schema: type[M]) -> M:
        """Structured outputs: the API is constrained to the schema and the result is validated again here."""
        try:
            r = self.client.beta.chat.completions.parse(
                model=self.model, temperature=0.2, response_format=schema,
                messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            )
            parsed = r.choices[0].message.parsed
        except (OpenAIError, ValidationError) as e:
            log.warning("AI structured call failed: %s", e)
            raise AIError(str(e)) from e
        if parsed is None:
            raise AIError("Model refused or returned no structured output")
        return schema.model_validate(parsed.model_dump())

    def embed(self, texts: list[str]) -> list[list[float]]:
        """Vectors for knowledge-base search (small model: cheap, and plenty for SOP passages)."""
        try:
            r = self.client.embeddings.create(model="text-embedding-3-small", input=[t[:8000] for t in texts])
        except OpenAIError as e:
            log.warning("Embedding call failed: %s", e)
            raise AIError(str(e)) from e
        return [d.embedding for d in r.data]

    def chat(self, system: str, messages: list[dict[str, str]]) -> str:
        try:
            r = self.client.chat.completions.create(
                model=self.model, temperature=0.3, max_tokens=500,
                messages=[{"role": "system", "content": system}, *messages],
            )
        except OpenAIError as e:
            log.warning("AI chat call failed: %s", e)
            raise AIError(str(e)) from e
        text = (r.choices[0].message.content or "").strip()
        if not text:
            raise AIError("Empty answer")
        return text
