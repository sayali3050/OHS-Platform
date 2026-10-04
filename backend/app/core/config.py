from functools import lru_cache
from typing import Annotated

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    # One .env for the whole project, at the repository root. Docker Compose passes it to the container as real
    # environment variables; running from backend/ outside Docker reads it from "../.env". Real environment
    # variables always win over the file (that's how `make dev-api` points DATABASE_URL at localhost).
    model_config = SettingsConfigDict(env_file="../.env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "SafeOps OHS Platform"
    environment: str = "development"
    api_prefix: str = "/api"

    database_url: str = "postgresql+psycopg://ohs:ohs@localhost:5432/ohs"

    jwt_secret_key: str = "change-me-in-.env"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 60
    remember_me_days: int = 14

    # NoDecode: accept "a,b" from .env instead of requiring a JSON list.
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173"]

    # AI: an empty key means the platform runs in clearly labelled Demo AI Mode.
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    ai_rate_limit_per_minute: int = 20

    demo_password: str = "Demo@1234"
    # False for a real site: no demo people or records, only reference content (roles, PPE types, courses,
    # a general pre-shift checklist). The first administrator then comes from ADMIN_EMAIL / ADMIN_PASSWORD.
    seed_demo_data: bool = True
    admin_email: str = ""
    admin_password: str = ""
    admin_name: str = "Administrator"

    # Public address of the app, used in password-reset links.
    app_url: str = "http://localhost:8080"
    # Optional mail server for password-reset emails. Without one the link is written to the API log, and
    # people without email ask their supervisor or an admin for a temporary password instead.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_tls: bool = True
    upload_dir: str = "uploads"
    max_upload_mb: int = 10
    max_photos_per_report: int = 3
    max_voice_mb: int = 8  # one voice note per report, roughly 5 minutes of phone audio

    # "Label:number" pairs separated by ";", e.g. "Site security:+91 20 5555 0100;Plant first-aid room:2222".
    # Empty means none configured: the emergency screen says so instead of showing a made-up number.
    emergency_contacts: Annotated[list[tuple[str, str]], NoDecode] = []
    # National emergency services, shown to everyone. "service:number" pairs; the service names (emergency, police,
    # fire, ambulance, women, disaster) are translated on screen. Defaults are India's official numbers.
    public_emergency_numbers: Annotated[list[tuple[str, str]], NoDecode] = [
        ("emergency", "112"), ("police", "100"), ("fire", "101"), ("ambulance", "108"),
    ]

    # Drudgery factor weights (relative; they don't need to add up to 1). Justified in the project report:
    # load and posture weigh most because they drive musculoskeletal injury.
    drudgery_weights: dict[str, float] = {
        "repetition": 0.15, "load": 0.2, "duration": 0.15, "posture": 0.2, "frequency": 0.1, "vibration": 0.1,
        "recovery": 0.1,
    }

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_origins(cls, v):
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    @field_validator("drudgery_weights")
    @classmethod
    def complete_weights(cls, v: dict[str, float]) -> dict[str, float]:
        """An override may name only some factors; the rest keep their defaults. Unknown names or negatives are refused."""
        defaults = cls.model_fields["drudgery_weights"].default
        unknown = set(v) - set(defaults)
        if unknown:
            raise ValueError(f"unknown drudgery factors: {', '.join(sorted(unknown))}")
        merged = {**defaults, **v}
        if any(w < 0 for w in merged.values()) or sum(merged.values()) <= 0:
            raise ValueError("drudgery weights must be non-negative and not all zero")
        return merged

    @field_validator("emergency_contacts", "public_emergency_numbers", mode="before")
    @classmethod
    def split_contacts(cls, v):
        if isinstance(v, str):
            pairs = [p.split(":", 1) for p in v.split(";") if ":" in p]
            return [(label.strip(), number.strip()) for label, number in pairs if label.strip() and number.strip()]
        return v

    @model_validator(mode="after")
    def safe_for_production(self):
        """Outside development a weak or default signing key would let anyone forge a login, so refuse to start."""
        if self.environment.lower() in ("production", "staging"):
            weak = self.jwt_secret_key in ("change-me-in-.env", "replace-with-a-long-random-string") or len(self.jwt_secret_key) < 32
            if weak:
                raise ValueError("JWT_SECRET_KEY must be a random string of at least 32 characters outside development")
            # Demo accounts share a published password, so they must never exist on a real site.
            if self.seed_demo_data:
                raise ValueError("Set SEED_DEMO_DATA=false outside development: demo accounts use a public password")
        return self

    @property
    def ai_demo_mode(self) -> bool:
        return not self.openai_api_key


@lru_cache
def get_settings() -> Settings:
    return Settings()
