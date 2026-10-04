"""Deterministic scoring for risk, ergonomics, drudgery and fatigue. No AI decides a number here.

Risk:       likelihood (1-5) x severity (1-5). Bands: 1-4 low, 5-9 moderate, 10-16 high, 20-25 critical.
Ergonomics: a short worker questionnaire scored by fixed rules into risk factors and a level. Not a medical
            assessment: high discomfort always recommends seeing a first aider or occupational health.
Drudgery:   seven factors scored 1-5 by a supervisor, weighted (weights in settings) to 0-100.
            Low < 40 <= moderate < 70 <= high.
Fatigue:    a daily check-in; a person is flagged when they report being very tired, high physical fatigue or
            very poor sleep.
Factor and recommendation codes are returned as keys the app translates, so every result reads in the user's
language.
"""
from app.core.config import get_settings

# --- risk ------------------------------------------------------------------------------------------------------

def risk_level(score: int) -> str:
    if score >= 20:
        return "critical"
    if score >= 10:
        return "high"
    if score >= 5:
        return "moderate"
    return "low"


# --- ergonomics ------------------------------------------------------------------------------------------------

POSTURES = ("bending", "twisting", "overhead", "kneeling", "squatting", "standing_long", "sitting_long")
BODY_AREAS = ("neck", "shoulders", "upper_back", "lower_back", "wrists_hands", "knees", "feet")


def score_ergonomics(a: dict) -> tuple[list[str], list[str], str, int]:
    """(risk factor codes, recommendation codes, level, points) from the questionnaire answers."""
    points, factors = 0, []

    def add(code: str, n: int) -> None:
        nonlocal points
        points += n
        factors.append(code)

    if a["heaviest_kg"] > 25:
        add("heavy_load", 3)
    elif a["heaviest_kg"] > 15:
        add("moderate_load", 2)
    if a["lifts_per_hour"] > 30:
        add("frequent_lifting", 2)
    for p, n in (("bending", 2), ("twisting", 2), ("overhead", 2), ("kneeling", 1), ("squatting", 1),
                 ("standing_long", 1), ("sitting_long", 1)):
        if p in a["postures"]:
            add(p, n)
    if a["repetitive_hand"]:
        add("repetitive_hand", 2)
    if a["vibration_tools"]:
        add("vibration", 2)
    if a["pushing_pulling"]:
        add("pushing_pulling", 1)
    if a["hours_per_day"] > 9:
        add("long_hours", 1)
    if a["discomfort_level"] >= 7:
        add("high_discomfort", 3)
    elif a["discomfort_level"] >= 4:
        add("some_discomfort", 2)
    if len(a["discomfort_areas"]) >= 3:
        add("many_areas", 1)

    level = "low" if points < 4 else "moderate" if points < 8 else "high" if points < 12 else "critical"
    recs = [f for f in factors if f not in ("some_discomfort", "many_areas", "high_discomfort")]
    if a["discomfort_level"] >= 7 or "high_discomfort" in factors:
        recs.insert(0, "see_health")  # always first: get it checked by a person, this tool can't
    elif a["discomfort_level"] >= 4:
        recs.append("report_discomfort")
    if level in ("high", "critical"):
        recs.append("task_review")
    return factors, recs or ["keep_going"], level, points


# --- drudgery --------------------------------------------------------------------------------------------------

DRUDGERY_FACTORS = ("repetition", "load", "duration", "posture", "frequency", "vibration", "recovery")


def drudgery_weights() -> dict[str, float]:
    return get_settings().drudgery_weights


def score_drudgery(factors: dict[str, int]) -> tuple[int, str, list[str]]:
    """(0-100 score, level, intervention codes for the factors scored 4 or 5, worst first)."""
    w = drudgery_weights()
    total = sum(w.values())
    score = round(100 * sum(w[f] * (factors[f] - 1) / 4 for f in DRUDGERY_FACTORS) / total)
    level = "low" if score < 40 else "moderate" if score < 70 else "high"
    worst = sorted((f for f in DRUDGERY_FACTORS if factors[f] >= 4), key=lambda f: (-factors[f], -w[f]))
    return score, level, worst


# --- fatigue check-in ------------------------------------------------------------------------------------------

def fatigued(feeling: str, sleep_quality: int, physical_fatigue: int) -> bool:
    return feeling == "very_tired" or physical_fatigue >= 4 or sleep_quality <= 2
