"""Seed the database. Idempotent: safe to run on every container start.

Always: roles, PPE types, training courses with lessons and quizzes (general safety content).
SEED_DEMO_DATA=true (default): a fictional demo organisation. Every name, employee ID and record is marked as demo data.
SEED_DEMO_DATA=false (a real site): a general pre-shift checklist and the first administrator from ADMIN_EMAIL /
ADMIN_PASSWORD. Everyone else registers themselves or is added by an admin or supervisor.
Phase 1 seeds the organisation (roles, departments, locations, people) plus PPE and training catalogues.
Phase 2 adds PPE assignments, training records, incidents, hazards and corrective actions (seed_history.py).
Phase 3 adds department profiles, personal details, health checks and work history (seed_profiles.py).
"""
import logging
import random

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.database.session import SessionLocal
from app.models import Department, Location, PPEItem, Role, TrainingCourse, User, Worker
from app.models.enums import Language, RoleName, Shift
from app.seed_history import seed_history
from app.seed_profiles import seed_profiles
from app.seed_assessments import seed_assessments
from app.seed_training import seed_course_content, seed_general_checklist, seed_training
from app.seed_knowledge import seed_knowledge
from app.services.users import create_user, password_problem

log = logging.getLogger("seed")
settings = get_settings()
rng = random.Random(42)  # deterministic, so every install shows the same demo

DEPARTMENTS = {
    ("Warehouse & Logistics", "WHL"): ["Loading Dock", "Warehouse Entrance", "High-Bay Racking", "Forklift Aisle"],
    ("Assembly Line", "ASM"): ["Line A", "Line B", "Quality Bench"],
    ("Metal Fabrication", "FAB"): ["Welding Bay", "CNC Cell", "Press Shop"],
    ("Maintenance", "MNT"): ["Electrical Room", "Tool Crib"],
    ("Chemical Storage", "CHM"): ["Solvent Store", "Mixing Room"],
    ("Packaging", "PKG"): ["Packing Station", "Palletising Area"],
}

PPE = [("Helmet", 1095), ("Safety shoes", 365), ("Gloves", 90), ("Safety glasses", 365), ("Ear protection", 180),
       ("Safety harness", 1825), ("Respirator", 180), ("Reflective vest", 365)]

COURSES = [("Fire Safety", "Fire Safety Essentials", True), ("First Aid", "Basic Workplace First Aid", True),
           ("PPE", "Choosing and Wearing PPE", True), ("Machine Safety", "Machine Guarding and Lockout", False),
           ("Electrical Safety", "Electrical Hazard Awareness", False),
           ("Chemical Safety", "Handling Hazardous Chemicals", False),
           ("Ergonomics", "Safe Lifting and Posture", True),
           ("Emergency Procedures", "Evacuation and Emergency Response", True)]

FIRST = ["Aarav", "Priya", "Rohan", "Sneha", "Vikram", "Ananya", "Karan", "Pooja", "Suresh", "Meera", "Amit",
         "Kavya", "Rahul", "Neha", "Sanjay", "Divya", "Arjun", "Isha", "Manoj", "Ritu", "Lukas", "Anna", "Jonas",
         "Lea", "Tobias", "Sara", "Deepak", "Swati", "Nikhil", "Tanvi", "Ganesh", "Aditi", "Farhan", "Leena"]
LAST = ["Patil", "Sharma", "Deshmukh", "Iyer", "Kulkarni", "Joshi", "Rao", "Nair", "Mehta", "Gupta", "Pawar",
        "Shinde", "Fischer", "Wagner", "Becker", "Khan"]


def _seed_roles(db: Session) -> None:
    for name, desc in [(RoleName.worker, "Shop-floor worker"), (RoleName.supervisor, "Line / area supervisor"),
                       (RoleName.admin, "Safety administrator")]:
        if not db.scalar(select(Role).where(Role.name == name)):
            db.add(Role(name=name, description=desc))
    db.flush()


def _seed_departments(db: Session) -> dict[str, Department]:
    out = {}
    for y, ((name, code), locs) in enumerate(DEPARTMENTS.items()):
        dept = db.scalar(select(Department).where(Department.code == code))
        if not dept:
            dept = Department(name=name, code=code, description=f"{name} (demo data)")
            dept.locations = [Location(name=loc, grid_x=x, grid_y=y) for x, loc in enumerate(locs)]
            db.add(dept)
        out[code] = dept
    db.flush()
    return out


def _user(db, email, **kw) -> User:
    return db.scalar(select(User).where(User.email == email)) or create_user(db, email=email, **kw)


def _seed_catalogues(db: Session) -> None:
    for name, days in PPE:
        if not db.scalar(select(PPEItem).where(PPEItem.name == name)):
            db.add(PPEItem(name=name, replacement_interval_days=days))
    for category, title, mandatory in COURSES:
        if not db.scalar(select(TrainingCourse).where(TrainingCourse.title == title)):
            db.add(TrainingCourse(title=title, category=category, is_mandatory=mandatory, description=f"{title}."))
    db.flush()
    seed_course_content(db)


def _seed_first_admin(db: Session) -> None:
    """Create the administrator named in .env, once. They must choose their own password at first sign-in."""
    email = settings.admin_email.strip().lower()
    has_admin = db.scalar(select(User.id).join(Role).where(Role.name == RoleName.admin).limit(1))
    if not email or not settings.admin_password:
        if not has_admin:
            log.warning("No administrator exists. Set ADMIN_EMAIL and ADMIN_PASSWORD in .env and restart the API.")
        return
    if db.scalar(select(User.id).where(User.email == email)):
        return
    problem = password_problem(settings.admin_password)
    if problem:
        log.error("ADMIN_PASSWORD rejected: %s. The administrator was not created.", problem)
        return
    n = 1
    while db.scalar(select(User.id).where(User.employee_id == f"ADM-{n:04d}")):
        n += 1
    admin = create_user(db, email=email, full_name=settings.admin_name.strip() or "Administrator",
                        password=settings.admin_password, employee_id=f"ADM-{n:04d}", role=RoleName.admin,
                        department_id=None)
    admin.must_change_password = True
    log.info("Administrator %s created. Sign in with ADMIN_PASSWORD and choose a new password.", email)


def seed(db: Session) -> None:
    _seed_roles(db)
    _seed_catalogues(db)
    if settings.seed_demo_data:
        _seed_demo(db)
    else:
        seed_general_checklist(db)
    _seed_first_admin(db)
    db.commit()


def _seed_demo(db: Session) -> None:
    depts = _seed_departments(db)
    pw = settings.demo_password

    admin = _user(db, "admin@demo.com", full_name="Demo Admin", password=pw, employee_id="ADM-0001",
                  role=RoleName.admin, department_id=None, phone="+91 00000 00001")
    supervisor = _user(db, "supervisor@demo.com", full_name="Demo Supervisor", password=pw, employee_id="SUP-0001",
                       role=RoleName.supervisor, department_id=depts["WHL"].id, phone="+91 00000 00002")
    worker = _user(db, "worker@demo.com", full_name="Demo Worker", password=pw, employee_id="WRK-0001",
                   role=RoleName.worker, department_id=depts["WHL"].id, phone="+91 00000 00003",
                   preferred_language=Language.hi)
    db.flush()
    worker.worker_profile.supervisor_id = supervisor.id
    worker.worker_profile.job_title = "Material Handler"
    worker.worker_profile.primary_location_id = depts["WHL"].locations[0].id

    # One supervisor per remaining department.
    sups = {"WHL": supervisor}
    for i, code in enumerate([c for c in depts if c != "WHL"], start=2):
        sups[code] = _user(db, f"supervisor.{code.lower()}@demo.com", full_name=f"{rng.choice(FIRST)} {rng.choice(LAST)}",
                           password=pw, employee_id=f"SUP-{i:04d}", role=RoleName.supervisor,
                           department_id=depts[code].id)
    db.flush()

    titles = ["Machine Operator", "Material Handler", "Welder", "Assembler", "Forklift Driver", "Packer",
              "Maintenance Technician", "Chemical Handler", "Quality Inspector"]
    codes = list(depts)
    for i in range(2, 35):  # 33 generated workers + the demo worker = 34
        code = codes[i % len(codes)]
        u = _user(db, f"worker{i:02d}@demo.com", full_name=f"{rng.choice(FIRST)} {rng.choice(LAST)}", password=pw,
                  employee_id=f"WRK-{i:04d}", role=RoleName.worker, department_id=depts[code].id,
                  preferred_language=rng.choice(list(Language)))
        db.flush()
        p: Worker = u.worker_profile
        p.supervisor_id = sups[code].id
        p.job_title = rng.choice(titles)
        p.shift = rng.choice(list(Shift))
        p.primary_location_id = rng.choice(depts[code].locations).id

    seed_history(db, worker)
    seed_profiles(db)
    seed_assessments(db, worker)
    seed_training(db, worker)
    seed_knowledge(db)
    db.flush()
    log.info("Demo data ready: admin=%s supervisor=%s worker=%s", admin.email, supervisor.email, worker.email)


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    with SessionLocal() as db:
        seed(db)


if __name__ == "__main__":
    main()
