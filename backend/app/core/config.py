from functools import lru_cache
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

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

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_origins(cls, v):
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    @field_validator("emergency_contacts", "public_emergency_numbers", mode="before")
    @classmethod
    def split_contacts(cls, v):
        if isinstance(v, str):
            pairs = [p.split(":", 1) for p in v.split(";") if ":" in p]
            return [(label.strip(), number.strip()) for label, number in pairs if label.strip() and number.strip()]
        return v

    @property
    def ai_demo_mode(self) -> bool:
        return not self.openai_api_key


@lru_cache
def get_settings() -> Settings:
    return Settings()
