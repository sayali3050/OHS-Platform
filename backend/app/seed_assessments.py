"""Synthetic demo data for Phase 5: risk register, drudgery scores, ergonomics questionnaires, fatigue check-ins.

Idempotent: each table is only filled while it is empty. All values are fictional but plausible for the area.
Scores are always computed by the same functions the API uses, never typed in here.
"""
import random
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    Department, DrudgeryAssessment, ErgonomicAssessment, Hazard, RiskAssessment, Role, User, WellbeingCheckin,
)
from app.models.enums import ControlLevel as C, RiskLevel, RoleName
from app.services.ergonomics import risk_level, score_drudgery, score_ergonomics

rng = random.Random(11)

# code -> [(title, likelihood, severity, exposure, existing controls, [(level, measure)])]
RISKS = {
    "WHL": [("Forklifts and pedestrians share aisles", 4, 5, "continuous", "Speed limit signs; horns",
             [(C.engineering, "Install barriers and a marked pedestrian walkway"), (C.engineering, "Blue spot lights on forklifts")]),
            ("Falling stock from high-bay racking", 3, 4, "daily", "Annual racking inspection",
             [(C.engineering, "Fit anti-collapse mesh to top levels"), (C.administrative, "Display bay load limits")]),
            ("Manual handling of 25 kg sacks", 4, 3, "daily", "Lifting training",
             [(C.substitution, "Order 10 kg sacks"), (C.engineering, "Repair the vacuum lift assist")])],
    "ASM": [("Repetitive torque-tool use", 4, 2, "continuous", "Job rotation every 2 hours",
             [(C.engineering, "Fit torque reaction arms")]),
            ("Conveyor nip points", 2, 4, "daily", "Guards on most nip points",
             [(C.engineering, "Guard the remaining nip points at Line B")])],
    "FAB": [("Welding fumes in the welding bay", 4, 4, "daily", "General ventilation; disposable masks",
             [(C.engineering, "Install on-torch fume extraction"), (C.ppe, "Fit-tested respirators")]),
            ("Noise above 85 dB at the press shop", 5, 3, "continuous", "Ear plugs available",
             [(C.engineering, "Acoustic enclosure for the 100 t press"), (C.administrative, "Annual hearing tests")]),
            ("Press brake hand injuries", 2, 5, "daily", "Two-hand controls",
             [(C.engineering, "Light curtain on the press brake")])],
    "MNT": [("Working on live electrical panels", 2, 5, "weekly", "Lockout-tagout procedure",
             [(C.administrative, "Weekly isolation audit"), (C.engineering, "Label every isolation point")]),
            ("Work at height on mezzanine", 3, 4, "weekly", "Step ladders",
             [(C.substitution, "Mobile elevating work platform instead of ladders")])],
    "CHM": [("Solvent vapour build-up in the store", 3, 5, "daily", "Natural ventilation; no-smoking rule",
             [(C.engineering, "Mechanical extract with gas detection"), (C.engineering, "Flameproof lighting")]),
            ("Splashes while decanting", 4, 3, "daily", "Gloves and goggles",
             [(C.engineering, "Closed transfer pump"), (C.ppe, "Face shields at the decanting point")])],
    "PKG": [("Strapping-band cuts", 3, 2, "daily", "Cut-resistant gloves",
             [(C.engineering, "Band cutters with shielded blades")]),
            ("Palletiser moving parts", 1, 4, "weekly", "Interlocked gate",
             [(C.administrative, "Monthly interlock test")])],
}

TASKS = {
    "WHL": ["Unloading 25 kg sacks", "Order picking", "Stretch-wrapping pallets"],
    "ASM": ["Torque fastening on Line A", "Final assembly"],
    "FAB": ["Manual grinding", "Loading the press brake"],
    "MNT": ["Overhead pipe repair"],
    "CHM": ["Drum handling and decanting"],
    "PKG": ["Carton erecting by hand", "Palletising by hand"],
}


def _empty(db: Session, model) -> bool:
    return not db.scalar(select(func.count()).select_from(model))


def _seed_risks(db: Session, depts: dict[str, Department], staff: dict[int, list[User]], today: date) -> None:
    for code, rows in RISKS.items():
        d = depts.get(code)
        if d is None:
            continue
        hazards = db.scalars(select(Hazard.id).where(Hazard.department_id == d.id).limit(len(rows))).all()
        for n, (title, lk, sv, exposure, existing, controls) in enumerate(rows):
            score = lk * sv
            db.add(RiskAssessment(
                title=title, department_id=d.id, location_id=rng.choice(d.locations).id if d.locations else None,
                hazard_id=hazards[n] if n < len(hazards) else None, likelihood=lk, severity_score=sv, risk_score=score,
                risk_level=RiskLevel(risk_level(score)), affected_workers=rng.randint(3, 18), exposure_frequency=exposure,
                existing_controls=existing,
                recommended_controls=[{"level": lvl.value, "measure": m} for lvl, m in controls],
                assessed_by=staff.get(d.id, [None])[0].id if staff.get(d.id) else None,
                review_due=today + timedelta(days=rng.choice([-10, 20, 45, 90, 180])),
            ))


def _seed_drudgery(db: Session, depts: dict[str, Department], workers: dict[int, list[User]],
                   staff: dict[int, list[User]]) -> None:
    for code, tasks in TASKS.items():
        d = depts.get(code)
        if d is None or not workers.get(d.id):
            continue
        for task in tasks:
            heavy = any(w in task.lower() for w in ("sack", "drum", "grinding", "by hand", "overhead"))
            factors = {f: min(5, max(1, rng.randint(2, 4) + (1 if heavy and f in ("load", "posture") else 0)))
                       for f in ("repetition", "load", "duration", "posture", "frequency", "vibration", "recovery")}
            if "grinding" in task.lower():
                factors["vibration"] = 5
            score, level, worst = score_drudgery(factors)
            db.add(DrudgeryAssessment(user_id=rng.choice(workers[d.id]).id, department_id=d.id, task_name=task,
                                      factors=factors, score=score, level=level, interventions=worst,
                                      assessed_by=staff[d.id][0].id if staff.get(d.id) else None))


def _seed_ergonomics(db: Session, demo_worker: User, workers: list[User]) -> None:
    samples = [
        (demo_worker, "Unloading sacks at the dock", dict(hours_per_day=8, lifts_per_hour=40, heaviest_kg=25,
         postures=["bending", "twisting"], repetitive_hand=False, vibration_tools=False, pushing_pulling=True,
         discomfort_areas=["lower_back"], discomfort_level=5)),
    ] + [(w, None, dict(hours_per_day=rng.choice([8, 9, 10]), lifts_per_hour=rng.choice([0, 10, 35]),
                         heaviest_kg=rng.choice([5, 12, 20, 30]), postures=rng.sample(["bending", "twisting", "overhead",
                         "standing_long", "kneeling"], k=rng.randint(0, 3)), repetitive_hand=rng.random() < 0.4,
                         vibration_tools=rng.random() < 0.2, pushing_pulling=rng.random() < 0.3,
                         discomfort_areas=rng.sample(["neck", "shoulders", "lower_back", "wrists_hands", "knees"], k=rng.randint(0, 3)),
                         discomfort_level=rng.randint(0, 8))) for w in rng.sample(workers, k=min(8, len(workers)))]
    for user, task, answers in samples:
        answers["postures"], answers["discomfort_areas"] = sorted(answers["postures"]), sorted(answers["discomfort_areas"])
        factors, recs, level, _ = score_ergonomics(answers)
        db.add(ErgonomicAssessment(user_id=user.id, task_description=task, answers=answers, risk_factors=factors,
                                   recommendations=recs, risk_level=RiskLevel(level)))


def _seed_checkins(db: Session, workers: list[User], demo_worker: User, today: date) -> None:
    for w in workers:
        tiredness = rng.random()
        for back in range(1, 15):  # up to yesterday, so "today" is still open for the demo
            if rng.random() < 0.25:
                continue  # nobody checks in every single day
            very = tiredness > 0.8 and rng.random() < 0.5
            db.add(WellbeingCheckin(
                user_id=w.id, checkin_date=today - timedelta(days=back),
                feeling="very_tired" if very else rng.choice(["energized", "normal", "normal", "tired"]),
                sleep_quality=rng.randint(1, 3) if very else rng.randint(3, 5), workload=rng.randint(2, 5),
                physical_fatigue=rng.randint(4, 5) if very else rng.randint(1, 3), mental_workload=rng.randint(1, 4),
                support_requested=very and back <= 2 and w.id != demo_worker.id,
            ))


def seed_assessments(db: Session, demo_worker: User) -> None:
    today = date.today()
    depts = {d.code: d for d in db.scalars(select(Department))}
    people = db.scalars(select(User).join(Role).where(User.is_active.is_(True), User.email.like("%@demo.com"))).unique().all()
    workers: dict[int, list[User]] = {}
    staff: dict[int, list[User]] = {}
    for u in people:
        if u.department_id is None:
            continue
        (workers if u.role.name == RoleName.worker else staff if u.role.name == RoleName.supervisor else {}).setdefault(
            u.department_id, []).append(u)
    for lst in (*workers.values(), *staff.values()):
        lst.sort(key=lambda u: u.id)
    if _empty(db, RiskAssessment):
        _seed_risks(db, depts, staff, today)
    if _empty(db, DrudgeryAssessment):
        _seed_drudgery(db, depts, workers, staff)
    all_workers = [w for lst in workers.values() for w in lst]
    if _empty(db, ErgonomicAssessment) and all_workers:
        _seed_ergonomics(db, demo_worker, [w for w in all_workers if w.id != demo_worker.id])
    if _empty(db, WellbeingCheckin):
        _seed_checkins(db, all_workers, demo_worker, today)
    db.flush()
