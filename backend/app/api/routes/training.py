"""Training: courses, reading, quizzes marked on the server, certificates, compliance and AI quiz generation."""
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai import service as ai
from app.api.routes.ai import ai_limiter
from app.auth.deps import get_current_user, require_admin, require_staff
from app.database.session import get_db
from app.models import QuizAttempt, QuizQuestion, Role, TrainingCourse, TrainingProgress, TrainingQuiz, User
from app.models.enums import Language, RoleName
from app.services import audit
from app.utils.forms import field_error
from app.utils.rate_limit import per_user_limit

router = APIRouter(prefix="/training", tags=["Training"])
READ_PCT = 50  # reading the material counts as half; passing the quiz completes the course


def _status(p: TrainingProgress | None, today: date) -> str:
    if p is None or (p.completion_pct == 0 and p.certified_on is None):
        return "not_started"
    if p.certified_on is None:
        return "in_progress"
    if p.expires_on and p.expires_on < today:
        return "expired"
    if p.expires_on and p.expires_on <= today + timedelta(days=30):
        return "expiring"
    return "valid"


class CourseCard(BaseModel):
    id: int
    title: str
    category: str
    description: str | None
    duration_minutes: int
    validity_days: int
    pass_mark: int
    mandatory: bool
    status: str
    completion_pct: int
    best_score: int | None
    certified_on: date | None
    expires_on: date | None
    quizzes: int


class QuestionOut(BaseModel):
    id: int
    kind: str
    prompt: str
    options: list[str]


class QuizOut(BaseModel):
    id: int
    title: str
    ai_generated: bool
    questions: list[QuestionOut]


class CourseDetail(CourseCard):
    content: str | None
    quiz: QuizOut | None
    can_manage: bool


def _progress(db: Session, user: User, course_id: int) -> TrainingProgress | None:
    return db.scalar(select(TrainingProgress).where(TrainingProgress.user_id == user.id, TrainingProgress.course_id == course_id))


def _latest_quiz(db: Session, course_id: int) -> TrainingQuiz | None:
    return db.scalar(select(TrainingQuiz).where(TrainingQuiz.course_id == course_id).order_by(TrainingQuiz.id.desc()).limit(1))


def _card(db: Session, c: TrainingCourse, user: User) -> dict:
    p = _progress(db, user, c.id)
    return dict(id=c.id, title=c.title, category=c.category, description=c.description, duration_minutes=c.duration_minutes,
                validity_days=c.validity_days, pass_mark=c.pass_mark, mandatory=c.is_mandatory,
                status=_status(p, date.today()), completion_pct=p.completion_pct if p else 0,
                best_score=p.best_score if p else None, certified_on=p.certified_on if p else None,
                expires_on=p.expires_on if p else None,
                quizzes=len(db.scalars(select(TrainingQuiz.id).where(TrainingQuiz.course_id == c.id)).all()))


@router.get("/courses", response_model=list[CourseCard], summary="All courses with your progress; mandatory first")
def courses(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(TrainingCourse).order_by(TrainingCourse.is_mandatory.desc(), TrainingCourse.title)).all()
    return [_card(db, c, user) for c in rows]


def _course(db: Session, course_id: int) -> TrainingCourse:
    c = db.get(TrainingCourse, course_id)
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Course not found")
    return c


@router.get("/courses/{course_id}", response_model=CourseDetail, summary="Course material and its quiz (answers hidden)")
def course(course_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = _course(db, course_id)
    q = _latest_quiz(db, c.id)
    return CourseDetail(**_card(db, c, user), content=c.content, can_manage=user.role.name in (RoleName.supervisor, RoleName.admin),
                        quiz=QuizOut(id=q.id, title=q.title, ai_generated=q.ai_generated,
                                     questions=[QuestionOut(id=x.id, kind=x.kind, prompt=x.prompt, options=x.options)
                                                for x in q.questions]) if q else None)


@router.post("/courses/{course_id}/read", response_model=CourseCard, summary="Mark the material as read")
def mark_read(course_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = _course(db, course_id)
    p = _progress(db, user, c.id)
    if p is None:
        p = TrainingProgress(user_id=user.id, course_id=c.id, completion_pct=0)
        db.add(p)
    p.completion_pct = max(p.completion_pct or 0, READ_PCT)
    db.commit()
    return _card(db, c, user)


class AttemptIn(BaseModel):
    answers: list[int]


class AttemptResult(BaseModel):
    score: int
    passed: bool
    pass_mark: int
    results: list[dict]  # per question: your answer, the correct one, explanation
    certified_on: date | None
    expires_on: date | None


@router.post("/quizzes/{quiz_id}/attempt", response_model=AttemptResult,
             summary="Submit answers. Marked on the server; passing certifies you for the course's validity period.")
def attempt(quiz_id: int, body: AttemptIn, request: Request, user: User = Depends(get_current_user),
            db: Session = Depends(get_db)):
    quiz = db.get(TrainingQuiz, quiz_id)
    if quiz is None or not quiz.questions:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Quiz not found")
    if len(body.answers) != len(quiz.questions):
        raise field_error("answers", "Answer every question")
    right = [a == q.correct_index for a, q in zip(body.answers, quiz.questions)]
    score = round(100 * sum(right) / len(right))
    course_ = db.get(TrainingCourse, quiz.course_id) if quiz.course_id else None
    pass_mark = course_.pass_mark if course_ else 70
    passed = score >= pass_mark
    db.add(QuizAttempt(quiz_id=quiz.id, user_id=user.id, answers=body.answers, score=score, passed=passed,
                       submitted_at=datetime.now(timezone.utc)))
    p = None
    if course_:
        p = _progress(db, user, course_.id)
        if p is None:
            p = TrainingProgress(user_id=user.id, course_id=course_.id, completion_pct=0)
            db.add(p)
        p.best_score = max(p.best_score or 0, score)
        if passed:
            p.completion_pct = 100
            p.certified_on = date.today()
            p.expires_on = date.today() + timedelta(days=course_.validity_days)
    audit.record(db, "training.attempt", user_id=user.id, entity_type="training_quiz", entity_id=quiz.id,
                 details={"score": score, "passed": passed}, request=request)
    db.commit()
    return AttemptResult(
        score=score, passed=passed, pass_mark=pass_mark,
        results=[{"question_id": q.id, "answer": a, "correct_index": q.correct_index, "correct": ok, "explanation": q.explanation}
                 for a, q, ok in zip(body.answers, quiz.questions, right)],
        certified_on=p.certified_on if p and passed else None, expires_on=p.expires_on if p and passed else None)


class Certificate(BaseModel):
    number: str
    name: str
    employee_id: str
    course: str
    score: int | None
    certified_on: date
    expires_on: date | None
    valid: bool


@router.get("/courses/{course_id}/certificate", response_model=Certificate, summary="Your certificate for a passed course")
def certificate(course_id: int, user_id: int | None = None, viewer: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    from app.services.people import can_view
    who = viewer
    if user_id and user_id != viewer.id:
        who = db.get(User, user_id)
        if who is None or not can_view(viewer, who):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Certificate not found")
    c = _course(db, course_id)
    p = _progress(db, who, c.id)
    if p is None or p.certified_on is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No certificate for this course yet")
    return Certificate(number=f"SO-{p.certified_on.year}-{who.id:04d}-{c.id:02d}", name=who.full_name,
                       employee_id=who.employee_id, course=c.title, score=p.best_score, certified_on=p.certified_on,
                       expires_on=p.expires_on, valid=not (p.expires_on and p.expires_on < date.today()))


# --- staff ------------------------------------------------------------------------------------------------------

class ComplianceRow(BaseModel):
    user_id: int
    full_name: str
    department: str | None
    statuses: dict[int, str]  # course id -> status
    compliance: int | None


class Compliance(BaseModel):
    courses: list[dict]
    rows: list[ComplianceRow]


@router.get("/compliance", response_model=Compliance, summary="Mandatory training status per worker (your department, or all)")
def compliance(user: User = Depends(require_staff), db: Session = Depends(get_db)):
    mandatory = db.scalars(select(TrainingCourse).where(TrainingCourse.is_mandatory.is_(True)).order_by(TrainingCourse.title)).all()
    stmt = select(User).join(Role).where(Role.name == RoleName.worker, User.is_active.is_(True))
    if user.role.name == RoleName.supervisor:
        stmt = stmt.where(User.department_id == user.department_id)
    workers = db.scalars(stmt.order_by(User.full_name)).unique().all()
    progress = {(p.user_id, p.course_id): p for p in db.scalars(select(TrainingProgress).where(
        TrainingProgress.user_id.in_([w.id for w in workers] or [0])))}
    today = date.today()
    rows = []
    for w in workers:
        st = {c.id: _status(progress.get((w.id, c.id)), today) for c in mandatory}
        ok = sum(s in ("valid", "expiring") for s in st.values())
        rows.append(ComplianceRow(user_id=w.id, full_name=w.full_name, department=w.department.name if w.department else None,
                                  statuses=st, compliance=round(100 * ok / len(st)) if st else None))
    rows.sort(key=lambda r: (r.compliance if r.compliance is not None else 101, r.full_name))
    return Compliance(courses=[{"id": c.id, "title": c.title} for c in mandatory], rows=rows)


class GenerateIn(BaseModel):
    course_id: int
    topic: str | None = Field(default=None, max_length=120)
    count: int = Field(default=5, ge=3, le=10)
    language: Language = Language.en


class DraftOut(BaseModel):
    demo_mode: bool
    questions: list[dict]


@router.post("/quizzes/generate", response_model=DraftOut, summary="AI draft quiz for a course (staff review before saving)")
def generate(body: GenerateIn, user: User = Depends(per_user_limit(ai_limiter)), db: Session = Depends(get_db)):
    if user.role.name not in (RoleName.supervisor, RoleName.admin):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only supervisors and admins can create quizzes.")
    c = _course(db, body.course_id)
    draft, demo = ai.generate_quiz(c.title, c.content or c.description or "", body.topic, body.count, body.language)
    return DraftOut(demo_mode=demo, questions=[q.model_dump() for q in draft.questions])


class SaveQuizIn(BaseModel):
    course_id: int
    title: str = Field(min_length=3, max_length=200)
    topic: str = Field(default="General", max_length=120)
    ai_generated: bool = False
    questions: list[dict]


@router.post("/quizzes", response_model=QuizOut, status_code=201, summary="Save a reviewed quiz; it becomes the course's quiz")
def save_quiz(body: SaveQuizIn, request: Request, user: User = Depends(require_staff), db: Session = Depends(get_db)):
    from app.ai.schemas import QuizDraft
    c = _course(db, body.course_id)
    try:
        draft = QuizDraft.model_validate({"questions": body.questions})  # same checks as AI output
    except ValueError as e:
        raise field_error("questions", str(e).splitlines()[0])
    quiz = TrainingQuiz(course_id=c.id, title=body.title.strip(), topic=body.topic, ai_generated=body.ai_generated, created_by=user.id)
    quiz.questions = [QuizQuestion(position=i, kind=q.kind, prompt=q.prompt, options=q.options, correct_index=q.correct_index,
                                   explanation=q.explanation) for i, q in enumerate(draft.questions)]
    db.add(quiz)
    db.flush()
    audit.record(db, "training.quiz_create", user_id=user.id, entity_type="training_quiz", entity_id=quiz.id,
                 details={"course": c.id, "ai": body.ai_generated}, request=request)
    db.commit()
    db.refresh(quiz)
    return QuizOut(id=quiz.id, title=quiz.title, ai_generated=quiz.ai_generated,
                   questions=[QuestionOut(id=x.id, kind=x.kind, prompt=x.prompt, options=x.options) for x in quiz.questions])


class CourseIn(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    category: str = Field(min_length=2, max_length=64)
    description: str | None = Field(default=None, max_length=500)
    content: str | None = Field(default=None, max_length=20000)
    duration_minutes: int = Field(default=30, ge=5, le=480)
    validity_days: int = Field(default=365, ge=30, le=1825)
    pass_mark: int = Field(default=70, ge=50, le=100)
    is_mandatory: bool = False


@router.post("/courses", response_model=CourseCard, status_code=201, summary="Add a course (admins)")
def create_course(body: CourseIn, request: Request, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    c = TrainingCourse(**body.model_dump())
    db.add(c)
    db.flush()
    audit.record(db, "training.course_create", user_id=admin.id, entity_type="training_course", entity_id=c.id, request=request)
    db.commit()
    return _card(db, c, admin)


@router.put("/courses/{course_id}", response_model=CourseCard, summary="Edit a course (admins)")
def update_course(course_id: int, body: CourseIn, request: Request, admin: User = Depends(require_admin),
                  db: Session = Depends(get_db)):
    c = _course(db, course_id)
    for k, v in body.model_dump().items():
        setattr(c, k, v)
    audit.record(db, "training.course_update", user_id=admin.id, entity_type="training_course", entity_id=c.id, request=request)
    db.commit()
    return _card(db, c, admin)
