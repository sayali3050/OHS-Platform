"""Synthetic demo details: department profiles, personal and employment details, health checks and work history.

Idempotent like the rest of the seed: a department is filled in only while its profile is empty, a person only
while they have no date of birth, and health checks / work history only when those tables are empty. Every value
is fictional. Phone numbers use the reserved +91 00000 range, so none of them can reach a real person.
"""
import random
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Department, HealthCheck, Role, User, WorkHistory
from app.models.enums import HealthCheckResult, RoleName

rng = random.Random(7)

PROFILES = {
    "WHL": dict(
        building="Block A, ground floor", shift_pattern="Three shifts (morning, evening, night)",
        working_hours="06:00–22:00, night picking 22:00–06:00", risk_level="high",
        main_activities="Receiving, put-away, order picking, loading and unloading trucks, stock counts.",
        machinery="4 counterbalance forklifts, 2 reach trucks, pallet jacks, dock levellers, stretch-wrapper.",
        key_hazards=["Forklift and pedestrian traffic", "Falling stock from high-bay racking", "Manual handling",
                     "Slips on shrink-wrap and spilled oil", "Dock edge falls"],
        required_ppe=["Safety shoes", "Reflective vest", "Gloves", "Helmet"],
        assembly_point="Assembly point A, car park east gate", first_aid_point="First-aid room next to Dock 1",
        fire_equipment="6 CO2 and 8 water extinguishers, 2 hose reels, sprinklers over racking"),
    "ASM": dict(
        building="Block B, hall 1", shift_pattern="Two shifts (morning, evening)", working_hours="07:00–23:00",
        risk_level="moderate",
        main_activities="Sub-assembly and final assembly on Lines A and B, torque checks, quality inspection.",
        machinery="Conveyor lines, pneumatic torque tools, overhead hoists, test benches.",
        key_hazards=["Repetitive strain", "Pinch points on conveyors", "Compressed air", "Awkward postures"],
        required_ppe=["Safety shoes", "Safety glasses", "Gloves"],
        assembly_point="Assembly point B, front lawn", first_aid_point="First-aid box at each line end",
        fire_equipment="8 water and 4 CO2 extinguishers, smoke detection"),
    "FAB": dict(
        building="Block C, heavy bay", shift_pattern="Two shifts (morning, evening)", working_hours="06:00–22:00",
        risk_level="critical",
        main_activities="Cutting, bending, MIG and TIG welding, CNC machining and pressing of steel parts.",
        machinery="2 CNC machining centres, 100 t hydraulic press, press brake, welding sets, plasma cutter.",
        key_hazards=["Welding fumes and arc flash", "Noise above 85 dB", "Hot metal and sparks",
                     "Unguarded moving parts", "Heavy lifting"],
        required_ppe=["Safety shoes", "Ear protection", "Safety glasses", "Gloves", "Respirator"],
        assembly_point="Assembly point C, rear yard", first_aid_point="First-aid room, Block C entrance",
        fire_equipment="10 CO2 and dry powder extinguishers, fire blankets at each welding bay"),
    "MNT": dict(
        building="Block D, workshop", shift_pattern="Day shift with night on-call", working_hours="08:00–17:00",
        risk_level="high",
        main_activities="Planned maintenance, breakdown repairs, electrical work, lockout/tagout.",
        machinery="Lathe, pillar drill, welding set, mobile elevating platform, test instruments.",
        key_hazards=["Live electrical equipment", "Work at height", "Stored energy during repairs", "Confined spaces"],
        required_ppe=["Safety shoes", "Helmet", "Safety harness", "Gloves", "Safety glasses"],
        assembly_point="Assembly point C, rear yard", first_aid_point="Workshop first-aid box and eyewash",
        fire_equipment="4 CO2 extinguishers rated for electrical fires"),
    "CHM": dict(
        building="Block E, isolated store", shift_pattern="Day shift only", working_hours="08:00–16:00",
        risk_level="critical",
        main_activities="Storage, dispensing and mixing of solvents, paints and cleaning chemicals.",
        machinery="Drum pumps, mixing vessels, local exhaust ventilation, spill kits.",
        key_hazards=["Flammable vapours", "Skin and eye contact with chemicals", "Spills and leaks",
                     "Inhalation of fumes"],
        required_ppe=["Respirator", "Gloves", "Safety glasses", "Safety shoes"],
        assembly_point="Assembly point D, upwind north fence", first_aid_point="Emergency shower and eyewash at door",
        fire_equipment="Foam and dry powder extinguishers, flameproof lighting, gas detectors"),
    "PKG": dict(
        building="Block B, hall 2", shift_pattern="Two shifts (morning, evening)", working_hours="07:00–23:00",
        risk_level="moderate",
        main_activities="Packing finished goods, labelling, palletising and wrapping for dispatch.",
        machinery="Carton erector, strapping machines, palletiser, stretch-wrapper.",
        key_hazards=["Manual handling of cartons", "Cuts from strapping and blades", "Moving palletiser parts"],
        required_ppe=["Safety shoes", "Gloves", "Reflective vest"],
        assembly_point="Assembly point B, front lawn", first_aid_point="First-aid box by Packing Station",
        fire_equipment="6 water extinguishers, sprinklers over carton store"),
}

QUALIFICATIONS = ["SSC (10th)", "HSC (12th)", "ITI Fitter", "ITI Welder", "ITI Electrician", "Diploma, Mechanical",
                  "B.Sc.", "Forklift operator licence"]
RELATIONS = ["Spouse", "Father", "Mother", "Brother", "Sister"]
CITIES = ["Pune", "Pimpri-Chinchwad", "Chakan", "Talegaon", "Hinjewadi"]
EMPLOYERS = ["Shree Engineering Works", "Deccan Logistics", "Sahyadri Auto Components", "Indus Packaging",
             "Western Fabricators"]


def _fill_departments(db: Session) -> None:
    for d in db.scalars(select(Department)):
        if d.building or d.code not in PROFILES:
            continue
        for k, v in PROFILES[d.code].items():
            setattr(d, k, v)
        d.contact_phone = f"+91 00000 1{d.id:04d}"
        d.head_id = db.scalar(select(User.id).join(Role).where(Role.name == RoleName.supervisor,
                                                               User.department_id == d.id).order_by(User.id).limit(1))


def _fill_people(db: Session, today: date) -> None:
    people = db.scalars(select(User).where(User.email.like("%@demo.com"))).unique().all()
    for u in people:
        if u.date_of_birth is not None:
            continue
        age = rng.randint(21, 55)
        u.date_of_birth = today.replace(year=today.year - age) - timedelta(days=rng.randint(0, 360))
        u.gender = rng.choice(["female", "male"])
        u.blood_group = rng.choice(["A+", "B+", "O+", "O+", "AB+", "A-", "B-", "O-"])
        u.address = f"{rng.randint(1, 200)}, Demo Society, {rng.choice(CITIES)} (demo)"
        u.date_of_joining = today - timedelta(days=rng.randint(200, 3000))
        u.qualification = rng.choice(QUALIFICATIONS)
        u.experience_years = max(1, min(age - 19, rng.randint(1, 20)))
        u.emergency_contact_name = f"{u.full_name.split()[-1]} family (demo)"
        u.emergency_contact_relation = rng.choice(RELATIONS)
        u.emergency_contact_phone = f"+91 00000 {rng.randint(20000, 99999)}"
        if u.role.name == RoleName.supervisor:
            u.designation = "Shift Supervisor"
        elif u.role.name == RoleName.admin:
            u.designation = "EHS Manager"
        if u.phone is None:
            u.phone = f"+91 00000 {rng.randint(20000, 99999)}"
    # The demo worker tells a consistent story on their profile.
    demo = db.scalar(select(User).where(User.email == "worker@demo.com"))
    if demo is not None and demo.medical_notes is None:
        demo.medical_notes = "Mild asthma: inhaler in locker 14. No known drug allergies."
        demo.qualification = "ITI Fitter; forklift operator licence"


def _seed_health(db: Session, today: date) -> None:
    if db.scalar(select(func.count(HealthCheck.id))):
        return
    staff = db.scalars(select(User).join(Role).where(Role.name.in_([RoleName.worker, RoleName.supervisor]),
                                                     User.email.like("%@demo.com"))).unique().all()
    for i, u in enumerate(staff):
        joined = u.date_of_joining or today - timedelta(days=400)
        db.add(HealthCheck(user_id=u.id, check_type="pre_employment", checked_on=joined - timedelta(days=7),
                           result=HealthCheckResult.fit, blood_pressure="118/76", pulse=72, vision="6/6",
                           hearing="Normal", examiner="Dr. Demo (Factory Medical Officer)"))
        last = today - timedelta(days=rng.randint(30, 420))
        result = HealthCheckResult.fit
        notes = None
        if i % 11 == 5:
            result, notes = HealthCheckResult.fit_with_restrictions, "No lifting above 15 kg for 3 months (back strain)."
        elif i % 17 == 9:
            result, notes = HealthCheckResult.temporarily_unfit, "Off work pending review of wrist injury."
        db.add(HealthCheck(user_id=u.id, check_type="periodic", checked_on=last, result=result,
                           blood_pressure=f"{rng.randint(110, 140)}/{rng.randint(70, 90)}", pulse=rng.randint(62, 88),
                           vision=rng.choice(["6/6", "6/9", "6/6 with glasses"]),
                           hearing=rng.choice(["Normal", "Normal", "Mild loss, left ear"]),
                           examiner="Dr. Demo (Factory Medical Officer)", notes=notes,
                           next_due_on=last + timedelta(days=365)))
    demo = db.scalar(select(User).where(User.email == "worker@demo.com"))
    if demo is not None:
        db.add(HealthCheck(user_id=demo.id, check_type="lung_function", checked_on=today - timedelta(days=60),
                           result=HealthCheckResult.fit, examiner="Dr. Demo (Factory Medical Officer)",
                           notes="Spirometry normal. Keep using a respirator near the chemical store.",
                           next_due_on=today + timedelta(days=305)))


def _seed_work_history(db: Session, today: date) -> None:
    if db.scalar(select(func.count(WorkHistory.id))):
        return
    people = db.scalars(select(User).where(User.email.like("%@demo.com"))).unique().all()
    for u in people:
        if (u.experience_years or 0) < 3:
            continue
        joined = u.date_of_joining or today - timedelta(days=400)
        start = joined - timedelta(days=365 * min(u.experience_years - 1, 6))
        db.add(WorkHistory(user_id=u.id, employer=f"{rng.choice(EMPLOYERS)} (demo)",
                           role_title=rng.choice(["Helper", "Machine Operator", "Fitter", "Store Assistant"]),
                           from_date=start, to_date=joined - timedelta(days=30)))


def seed_profiles(db: Session) -> None:
    today = date.today()
    _fill_departments(db)
    _fill_people(db, today)
    db.flush()
    _seed_health(db, today)
    _seed_work_history(db, today)
    db.flush()
