"""Phase 2 demo history: PPE, training records, incidents, hazards, corrective actions and notifications.

All synthetic. Dates are relative to today so the demo always looks current. Each block only runs when its
table is empty, so restarting the container never duplicates history.

The demo worker is set up so their dashboard tells a clear story: PPE 80% (gloves overdue for replacement),
mandatory training 100%, safety score 90.
"""
import random
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    CorrectiveAction, Department, Hazard, Incident, Notification, PPEAssignment, PPEItem, Role, TrainingCourse,
    TrainingProgress, User,
)
from app.models.enums import (
    ActionStatus, ControlLevel, HazardCategory, HazardStatus, IncidentStatus, NotificationPriority, Priority, RoleName,
    Severity,
)

rng = random.Random(2026)

BASE_PPE = ["Helmet", "Safety shoes", "Gloves", "Safety glasses"]
DEPT_PPE = {"WHL": "Reflective vest", "FAB": "Ear protection", "MNT": "Safety harness", "CHM": "Respirator",
            "ASM": "Ear protection", "PKG": "Reflective vest"}

# (department, category, severity, injury, title, description)
INCIDENTS = [
    ("WHL", "near_miss", Severity.high, False, "Forklift reversed close to pedestrian",
     "Forklift reversing out of aisle 4 came within a metre of a picker. Reversing alarm was working but the "
     "picker had ear defenders on and the mirror at the aisle end is cracked."),
    ("WHL", "manual_handling", Severity.medium, True, "Back strain lifting cement bags",
     "Worker felt a sharp pain in the lower back while lifting 50 kg cement bags from the pallet to the trolley. "
     "Lift assist was out of service."),
    ("WHL", "slip_trip_fall", Severity.low, True, "Slipped on shrink-wrap offcut",
     "Stepped on loose shrink-wrap near the loading dock door and fell onto one knee. Bruising only."),
    ("WHL", "struck_by", Severity.medium, False, "Carton fell from second rack level",
     "A carton slid off the second level of the high-bay racking during picking. Nobody was below it."),
    ("ASM", "caught_in_machinery", Severity.high, True, "Glove caught in conveyor roller",
     "Operator's glove was pulled into the conveyor roller while clearing a jam on Line A. Hand withdrawn, "
     "finger bruised. The guard had been removed for cleaning and not refitted."),
    ("ASM", "cut_laceration", Severity.low, True, "Cut from sharp sheet edge",
     "Minor cut to forearm from an unfinished panel edge at the quality bench."),
    ("ASM", "near_miss", Severity.medium, False, "Pneumatic hose disconnected under pressure",
     "Air hose on Line B came off the coupling and whipped across the walkway."),
    ("ASM", "manual_handling", Severity.medium, True, "Shoulder pain after repetitive overhead work",
     "Assembler reported shoulder pain after a full shift fitting overhead brackets on Line B."),
    ("FAB", "burn", Severity.medium, True, "Spatter burn through welding jacket gap",
     "Weld spatter entered between the jacket cuff and glove, causing a small burn to the wrist."),
    ("FAB", "struck_by", Severity.critical, True, "Workpiece ejected from press",
     "A partly formed bracket was ejected from the press and struck the operator's shin. First aid given and "
     "taken to hospital for an X-ray as a precaution."),
    ("FAB", "near_miss", Severity.medium, False, "CNC door interlock bypassed",
     "Found the CNC cell door interlock taped over so the machine could run with the door open."),
    ("FAB", "electrical", Severity.high, False, "Damaged welding lead insulation",
     "Welder noticed exposed conductor on the welding lead where it crosses the walkway."),
    ("MNT", "fall_from_height", Severity.high, True, "Fall from step ladder",
     "Technician fell about 1.2 m from a step ladder while changing a light fitting in the electrical room. "
     "Ladder was on an uneven floor."),
    ("MNT", "electrical", Severity.critical, False, "Panel energised during maintenance",
     "Distribution panel was found energised although it was tagged as isolated. Lockout procedure not followed."),
    ("MNT", "cut_laceration", Severity.low, True, "Cut from utility knife",
     "Knife slipped while cutting cable ties in the tool crib."),
    ("CHM", "chemical_exposure", Severity.high, True, "Solvent splash to face",
     "Solvent splashed while decanting into a smaller container. Eye wash used for 15 minutes. "
     "Face shield was not worn."),
    ("CHM", "near_miss", Severity.medium, False, "Incompatible chemicals stored together",
     "Acid and oxidiser containers found on the same shelf in the solvent store."),
    ("CHM", "chemical_exposure", Severity.medium, False, "Strong vapour smell in mixing room",
     "Several workers reported headaches and a strong smell. Extraction fan found switched off."),
    ("PKG", "manual_handling", Severity.medium, True, "Wrist strain from taping cartons",
     "Packer reported wrist pain after a double shift taping cartons by hand."),
    ("PKG", "slip_trip_fall", Severity.low, False, "Tripped over pallet jack handle",
     "Pallet jack left in the walkway with the handle down. Worker stumbled but did not fall."),
    ("PKG", "vehicle", Severity.medium, False, "Delivery van reversed into palletising area",
     "Delivery driver reversed beyond the marked bay into the palletising area."),
    ("WHL", "slip_trip_fall", Severity.medium, True, "Fall on wet dock ramp",
     "Loading dock ramp was wet from rain. Worker slipped carrying a box and sprained an ankle."),
    ("ASM", "near_miss", Severity.low, False, "Tool left on moving conveyor",
     "A torque wrench was left on the conveyor and travelled to the next station."),
    ("FAB", "burn", Severity.low, True, "Touched hot workpiece",
     "Picked up a freshly cut part without heat-resistant gloves. Minor burn to fingertips."),
]

# (department, category, severity, description)
HAZARDS = [
    ("WHL", HazardCategory.slippery_floor, Severity.medium, "Oil leak under forklift parking bay spreading into the aisle."),
    ("WHL", HazardCategory.blocked_exit, Severity.high, "Fire exit by the loading dock blocked by stacked pallets."),
    ("WHL", HazardCategory.poor_lighting, Severity.medium, "Two lights out in forklift aisle 3, dark at the far end."),
    ("WHL", HazardCategory.unsafe_lifting, Severity.medium, "Heavy sacks stored on the bottom shelf, forcing workers to bend low."),
    ("WHL", HazardCategory.unsafe_machine, Severity.high, "Forklift horn not working on truck FL-07."),
    ("ASM", HazardCategory.unsafe_machine, Severity.high, "Emergency stop on Line A station 3 sticks and has to be pulled out by hand."),
    ("ASM", HazardCategory.excessive_noise, Severity.medium, "Rivet gun noise very loud near Line B; ear protection dispenser empty."),
    ("ASM", HazardCategory.ergonomic, Severity.medium, "Workbench at the quality bench is too low, inspectors stoop all shift."),
    ("ASM", HazardCategory.exposed_wire, Severity.high, "Cable to the Line B lamp is frayed where it passes the conveyor frame."),
    ("FAB", HazardCategory.fire_hazard, Severity.high, "Oily rags piled in an open bin next to the welding bay."),
    ("FAB", HazardCategory.missing_ppe, Severity.medium, "No spare welding visors available for visitors or new starters."),
    ("FAB", HazardCategory.excessive_noise, Severity.high, "Press shop noise is high; people talk without ear defenders on the walkway."),
    ("FAB", HazardCategory.unsafe_machine, Severity.critical, "Light curtain on press 2 not stopping the stroke when tested."),
    ("MNT", HazardCategory.exposed_wire, Severity.critical, "Distribution board cover missing in the electrical room."),
    ("MNT", HazardCategory.slippery_floor, Severity.low, "Water dripping from the ceiling near the tool crib."),
    ("MNT", HazardCategory.other, Severity.medium, "Ladder with cracked rung still in use; no tag on it."),
    ("CHM", HazardCategory.chemical_leak, Severity.high, "Drum in the solvent store weeping at the bung."),
    ("CHM", HazardCategory.missing_ppe, Severity.medium, "Chemical gloves in the mixing room are torn; no new stock."),
    ("CHM", HazardCategory.blocked_exit, Severity.medium, "Spill kit placed in front of the mixing room emergency shower."),
    ("CHM", HazardCategory.fire_hazard, Severity.high, "Smoking near the solvent store door at break time."),
    ("PKG", HazardCategory.ergonomic, Severity.medium, "Packing station height can't be adjusted; tall packers bend all day."),
    ("PKG", HazardCategory.unsafe_lifting, Severity.medium, "Full cartons stacked above shoulder height on the palletiser."),
    ("PKG", HazardCategory.poor_lighting, Severity.low, "Flickering tube light above packing station 2."),
    ("PKG", HazardCategory.slippery_floor, Severity.low, "Cardboard dust on the floor makes it slippery near the baler."),
    ("WHL", HazardCategory.missing_ppe, Severity.low, "Reflective vests missing from the hooks at the warehouse entrance."),
    ("ASM", HazardCategory.other, Severity.low, "First aid box at Line A missing plasters and eye wash."),
]

ACTIONS = {
    "near_miss": ("Brief the team on the near miss and fix the contributing condition.", ControlLevel.administrative),
    "manual_handling": ("Repair the lift assist and limit manual lifts to 25 kg.", ControlLevel.engineering),
    "slip_trip_fall": ("Add a housekeeping check at shift start and clear the walkway.", ControlLevel.administrative),
    "struck_by": ("Fit edge guards to the affected equipment.", ControlLevel.engineering),
    "caught_in_machinery": ("Refit the guard and add an interlock so the machine can't run without it.",
                            ControlLevel.engineering),
    "cut_laceration": ("Issue cut-resistant gloves and deburr edges before handling.", ControlLevel.ppe),
    "burn": ("Issue gauntlet gloves and add a cooling rack for hot parts.", ControlLevel.engineering),
    "fall_from_height": ("Replace step ladders with a podium platform for overhead work.", ControlLevel.substitution),
    "electrical": ("Retrain on lockout-tagout and audit isolations weekly.", ControlLevel.administrative),
    "chemical_exposure": ("Install a closed transfer pump for decanting.", ControlLevel.engineering),
    "vehicle": ("Mark a physical barrier between the delivery bay and the work area.", ControlLevel.engineering),
}


def _at(days_ago: int, hour: int | None = None) -> datetime:
    d = date.today() - timedelta(days=days_ago)
    return datetime.combine(d, time(hour if hour is not None else rng.randint(6, 21), rng.randint(0, 59)),
                            tzinfo=timezone.utc)


def _empty(db: Session, model) -> bool:
    return not db.scalar(select(func.count()).select_from(model))


def _people(db: Session) -> dict:
    users = db.scalars(select(User).join(Role).where(User.is_active.is_(True))).unique().all()
    by_dept: dict[int, dict[str, list[User]]] = {}
    for u in users:
        if u.department_id is not None:
            by_dept.setdefault(u.department_id, {"worker": [], "supervisor": []})
            if u.role.name in (RoleName.worker, RoleName.supervisor):
                by_dept[u.department_id][u.role.name.value].append(u)
    for group in by_dept.values():
        for lst in group.values():
            lst.sort(key=lambda u: u.id)
    return by_dept


def _seed_ppe(db: Session, today: date, demo_worker: User) -> None:
    items = {i.name: i for i in db.scalars(select(PPEItem))}
    codes = {d.id: d.code for d in db.scalars(select(Department))}
    workers = db.scalars(select(User).join(Role).where(Role.name == RoleName.worker).order_by(User.id)).unique().all()
    for u in workers:
        if u.worker_profile is None:
            continue
        names = BASE_PPE + [DEPT_PPE.get(codes.get(u.department_id, ""), "Reflective vest")]
        for name in dict.fromkeys(names):
            item = items[name]
            if u.id == demo_worker.id:
                # Story for the demo: gloves 12 days past replacement, everything else in date.
                replace_by = today - timedelta(days=12) if name == "Gloves" else today + timedelta(days=60 + 20 * len(name))
                status = "ok"
            else:
                roll = rng.random()
                replace_by = (today - timedelta(days=rng.randint(3, 40)) if roll < 0.12
                              else today + timedelta(days=rng.randint(5, 25)) if roll < 0.22
                              else today + timedelta(days=rng.randint(40, item.replacement_interval_days)))
                status = "damaged" if rng.random() < 0.04 else "ok"
            issued = replace_by - timedelta(days=item.replacement_interval_days)
            db.add(PPEAssignment(worker_id=u.worker_profile.id, ppe_item_id=item.id, issued_on=issued,
                                 replace_by=replace_by, inspection_status=status,
                                 last_inspected_on=today - timedelta(days=rng.randint(1, 60))))


def _seed_training(db: Session, today: date, demo_worker: User) -> None:
    courses = db.scalars(select(TrainingCourse).order_by(TrainingCourse.id)).all()
    users = db.scalars(select(User).join(Role).where(Role.name.in_([RoleName.worker, RoleName.supervisor]))
                       .order_by(User.id)).unique().all()
    for u in users:
        for c in courses:
            if u.id == demo_worker.id:
                if c.is_mandatory:
                    certified = today - timedelta(days=30 + 25 * c.id)
                    db.add(TrainingProgress(user_id=u.id, course_id=c.id, completion_pct=100,
                                            best_score=rng.randint(78, 98), certified_on=certified,
                                            expires_on=certified + timedelta(days=c.validity_days)))
                elif c.category == "Machine Safety":
                    db.add(TrainingProgress(user_id=u.id, course_id=c.id, completion_pct=40))
                continue
            roll = rng.random()
            if not c.is_mandatory and roll < 0.6:
                continue
            if roll < 0.75:
                certified = today - timedelta(days=rng.randint(10, 330))
            elif roll < 0.85:
                certified = today - timedelta(days=rng.randint(370, 500))  # expired
            elif roll < 0.95:
                db.add(TrainingProgress(user_id=u.id, course_id=c.id, completion_pct=rng.choice([20, 40, 60, 80])))
                continue
            else:
                continue  # not started
            db.add(TrainingProgress(user_id=u.id, course_id=c.id, completion_pct=100, best_score=rng.randint(70, 100),
                                    certified_on=certified, expires_on=certified + timedelta(days=c.validity_days)))


def _incident_status(days_ago: int) -> IncidentStatus:
    if days_ago > 75:
        return IncidentStatus.closed
    if days_ago > 40:
        return rng.choice([IncidentStatus.closed, IncidentStatus.closed, IncidentStatus.verification])
    if days_ago > 14:
        return rng.choice([IncidentStatus.corrective_action, IncidentStatus.investigating, IncidentStatus.verification])
    if days_ago > 4:
        return rng.choice([IncidentStatus.assigned, IncidentStatus.investigating])
    return IncidentStatus.reported


def _seed_reports(db: Session, today: date, demo_worker: User) -> None:
    depts = {d.code: d for d in db.scalars(select(Department))}
    people = _people(db)
    year_counts: dict[tuple[str, int], int] = {}

    def ref(prefix: str, when: datetime) -> str:
        key = (prefix, when.year)
        year_counts[key] = year_counts.get(key, 0) + 1
        return f"{prefix}-{when.year}-{year_counts[key]:04d}"

    # Spread over the last ~6 months, oldest first so references increase with time.
    inc_days = sorted((rng.randint(1, 180) for _ in INCIDENTS), reverse=True)
    inc_days[-1], inc_days[-2] = 2, 9  # make sure something is fresh in the supervisor's inbox
    # Three incidents by the demo worker at varied ages; the newest is one of them, so the demo supervisor
    # (same department) starts with an unread notification.
    demo_slots = {len(INCIDENTS) - 1, len(INCIDENTS) - 9, 5}
    whl_incidents = [i for i, row in enumerate(INCIDENTS) if row[0] == "WHL"]

    for n, days_ago in enumerate(inc_days):
        # The demo worker's reports must be in their own department, so swap in a WHL template for those slots.
        template = INCIDENTS[whl_incidents[n % len(whl_incidents)]] if n in demo_slots else INCIDENTS[n]
        code, category, severity, injury, title, description = template
        dept = depts[code]
        staff = people.get(dept.id, {"worker": [], "supervisor": []})
        reporter = demo_worker if n in demo_slots else rng.choice(staff["worker"] or [demo_worker])
        supervisor = staff["supervisor"][0] if staff["supervisor"] else None
        when = _at(days_ago)
        status = _incident_status(days_ago)
        inc = Incident(
            reference=ref("INC", when), title=title, description=description, category=category, severity=severity,
            occurred_at=when, reporter_id=reporter.id, department_id=dept.id,
            location_id=rng.choice(dept.locations).id, injury_occurred=injury,
            injury_details="First aid given on site." if injury else None, status=status,
            investigator_id=supervisor.id if supervisor and status != IncidentStatus.reported else None,
            created_at=when + timedelta(minutes=rng.randint(5, 90)),
            closed_at=when + timedelta(days=rng.randint(10, 30)) if status == IncidentStatus.closed else None,
        )
        inc.updated_at = inc.created_at
        db.add(inc)
        db.flush()
        if status in (IncidentStatus.corrective_action, IncidentStatus.verification, IncidentStatus.closed):
            text, level = ACTIONS.get(category, ACTIONS["near_miss"])
            due = (when + timedelta(days=rng.randint(14, 30))).date()
            done = status == IncidentStatus.closed or (status == IncidentStatus.verification and rng.random() < 0.7)
            db.add(CorrectiveAction(
                incident_id=inc.id, description=text, control_level=level,
                responsible_id=supervisor.id if supervisor else None, due_date=due,
                priority=Priority.high if severity in (Severity.high, Severity.critical) else Priority.medium,
                status=(ActionStatus.completed if done else ActionStatus.overdue if due < today
                        else ActionStatus.in_progress),
                completed_at=datetime.combine(due - timedelta(days=2), time(15), tzinfo=timezone.utc) if done else None,
            ))
        if days_ago <= 21:
            _notify_team(db, staff["supervisor"], f"{severity.value.title()} incident reported: {title}",
                         f"{inc.reference} reported by {reporter.full_name}.", f"/app/reports/incidents/{inc.id}",
                         severity, inc.created_at, read=days_ago > 3)

    haz_days = sorted((rng.randint(1, 150) for _ in HAZARDS), reverse=True)
    haz_days[-1], haz_days[24] = 1, 2  # row 24 is a fresh WHL hazard from the demo worker
    anonymous = {3, 11, 19}
    demo_hazards = {4, 24}  # WHL rows: the demo worker's own department
    for n, days_ago in enumerate(haz_days):
        code, category, severity, description = HAZARDS[n]
        dept = depts[code]
        staff = people.get(dept.id, {"worker": [], "supervisor": []})
        is_anon = n in anonymous
        reporter = None if is_anon else demo_worker if n in demo_hazards else rng.choice(staff["worker"] or [demo_worker])
        when = _at(days_ago)
        status = (HazardStatus.closed if days_ago > 60 else HazardStatus.controlled if days_ago > 30
                  else HazardStatus.in_review if days_ago > 5 else HazardStatus.open)
        hz = Hazard(
            reference=ref("HAZ", when), category=category, description=description, severity=severity,
            priority={Severity.low: Priority.low, Severity.medium: Priority.medium, Severity.high: Priority.high,
                      Severity.critical: Priority.urgent}[severity],
            reporter_id=reporter.id if reporter else None, is_anonymous=is_anon, department_id=dept.id,
            location_id=rng.choice(dept.locations).id, status=status, created_at=when, updated_at=when,
        )
        db.add(hz)
        db.flush()
        if status == HazardStatus.in_review and severity in (Severity.high, Severity.critical):
            db.add(CorrectiveAction(
                hazard_id=hz.id, description="Make the area safe and fix the reported condition.",
                control_level=ControlLevel.engineering,
                responsible_id=staff["supervisor"][0].id if staff["supervisor"] else None,
                due_date=(when + timedelta(days=7)).date(), priority=Priority.high,
                status=ActionStatus.overdue if (when + timedelta(days=7)).date() < today else ActionStatus.pending,
            ))
        if days_ago <= 21:
            who = "anonymously" if is_anon else f"by {reporter.full_name}"
            _notify_team(db, staff["supervisor"], f"{severity.value.title()} hazard reported: "
                         f"{category.value.replace('_', ' ')}", f"{hz.reference} reported {who}.",
                         f"/app/reports/hazards/{hz.id}", severity, when, read=days_ago > 3)


def _notify_team(db, supervisors, title, body, link, severity, when, read):
    priority = (NotificationPriority.critical if severity == Severity.critical
                else NotificationPriority.warning if severity == Severity.high else NotificationPriority.info)
    for s in supervisors:
        db.add(Notification(user_id=s.id, kind="report", priority=priority, title=title, body=body, link=link,
                            created_at=when, updated_at=when, read_at=when + timedelta(hours=5) if read else None))


def seed_history(db: Session, demo_worker: User) -> None:
    today = date.today()
    if _empty(db, PPEAssignment):
        _seed_ppe(db, today, demo_worker)
    if _empty(db, TrainingProgress):
        _seed_training(db, today, demo_worker)
    if _empty(db, Incident) and _empty(db, Hazard):
        _seed_reports(db, today, demo_worker)
    db.flush()
