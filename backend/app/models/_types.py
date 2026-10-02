"""Portable enum column: VARCHAR + CHECK constraint on every backend (no native PG enum churn in migrations)."""
from sqlalchemy import Enum as SAEnum


def enum_col(enum_cls):
    return SAEnum(enum_cls, native_enum=False, length=32, values_callable=lambda e: [m.value for m in e],
                  validate_strings=True, create_constraint=True, name=f"{enum_cls.__name__.lower()}_enum")
