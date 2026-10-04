"""Synthetic demo data for Phase 6: course material and quizzes, safety checklists and two weeks of results.

Idempotent: course material is filled in only while a course has none of its own, a quiz is added only to courses
without one, and checklists/results only while those tables are empty.
"""
import random
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import ChecklistResult, Department, QuizQuestion, Role, SafetyChecklist, TrainingCourse, TrainingQuiz, User
from app.models.enums import RoleName
from app.training_content import COURSES

rng = random.Random(23)

CHECKLISTS = [
    ("Pre-shift safety walk", "daily", None, ["Walkways and exits are clear", "No spills or trip hazards on the floor",
                                              "Guards are fitted on the machines I will use", "My PPE is in good condition",
                                              "Fire extinguishers are in place and not blocked"]),
    ("Forklift pre-use check", "daily", "WHL", ["Brakes and parking brake work", "Horn and lights work", "Forks and chains have no cracks",
                                               "Seat belt works", "No hydraulic leaks"]),
    ("Welding bay check", "daily", "FAB", ["Fume extraction is switched on", "Welding screens are in place",
                                          "Gas cylinders are chained upright", "Fire blanket is in place"]),
    ("Chemical store weekly inspection", "weekly", "CHM", ["Containers are closed and labelled", "Spill kit is complete",
                                                           "Eyewash and shower work", "Extraction fan works",
                                                           "Incompatible chemicals are stored apart"]),
]
# Items that fail now and then in the demo, so supervisors see what a "No" looks like.
SOMETIMES_NO = {"No spills or trip hazards on the floor", "Horn and lights work", "Fume extraction is switched on", "Spill kit is complete"}


def seed_course_content(db: Session) -> None:
    """Lessons and a quiz for the built-in courses. General safety content, used on demo and real sites alike."""
    for c in db.scalars(select(TrainingCourse)):
        if c.title not in COURSES:
            continue
        content, questions = COURSES[c.title]
        if not c.content:
            c.content = content
            c.description = content.split("\n")[1][:300] if "\n" in content else c.description
            c.duration_minutes = 20
        if not db.scalar(select(func.count(TrainingQuiz.id)).where(TrainingQuiz.course_id == c.id)):
            quiz = TrainingQuiz(course_id=c.id, title=f"{c.title}: check your knowledge", topic=c.category)
            quiz.questions = [QuizQuestion(position=i, kind=k, prompt=p, options=o, correct_index=ci, explanation=e)
                              for i, (k, p, o, ci, e) in enumerate(questions)]
            db.add(quiz)


def _seed_checklists(db: Session, today: date, demo_worker: User) -> None:
    depts = {d.code: d for d in db.scalars(select(Department))}
    lists = []
    for title, freq, code, items in CHECKLISTS:
        c = SafetyChecklist(title=title, frequency=freq, department_id=depts[code].id if code and code in depts else None,
                            items=[{"id": i + 1, "text": t} for i, t in enumerate(items)], is_active=True)
        db.add(c)
        lists.append(c)
    db.flush()
    workers = db.scalars(select(User).join(Role).where(Role.name == RoleName.worker, User.is_active.is_(True),
                                                       User.email.like("%@demo.com"))).unique().all()
    for w in workers:
        diligent = w.id == demo_worker.id or rng.random() < 0.6
        for back in range(1, 15):
            day = today - timedelta(days=back)
            for c in lists:
                if c.department_id not in (None, w.department_id):
                    continue
                if c.frequency == "weekly" and day.weekday() != 0:
                    continue
                if not diligent and rng.random() < 0.35:
                    continue
                answers = [{"item_id": i["id"], "answer": "no" if i["text"] in SOMETIMES_NO and w.id != demo_worker.id
                            and rng.random() < 0.12 else "yes", "note": None} for i in c.items]
                when = datetime.combine(day, time(rng.randint(6, 9), rng.randint(0, 59)), tzinfo=timezone.utc)
                db.add(ChecklistResult(checklist_id=c.id, user_id=w.id, location_id=None, answers=answers,
                                       failed_items=sum(a["answer"] == "no" for a in answers), completed_at=when))


def seed_general_checklist(db: Session) -> None:
    """A real site starts with the site-wide pre-shift walk; admins and supervisors add their own later."""
    if db.scalar(select(func.count(SafetyChecklist.id))):
        return
    title, freq, _, items = CHECKLISTS[0]
    db.add(SafetyChecklist(title=title, frequency=freq, department_id=None,
                           items=[{"id": i + 1, "text": t} for i, t in enumerate(items)], is_active=True))


def seed_training(db: Session, demo_worker: User) -> None:
    seed_course_content(db)
    if not db.scalar(select(func.count(SafetyChecklist.id))):
        _seed_checklists(db, date.today(), demo_worker)
    db.flush()
