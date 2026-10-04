from collections.abc import Callable, Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Notification, Role, User
from app.models.enums import Language, NotificationPriority, RoleName


def notify(db: Session, user_ids: Iterable[int], *, kind: str, title: str, body: str | None = None,
           link: str | None = None, priority: NotificationPriority = NotificationPriority.info) -> int:
    """Queue one in-app notification per recipient in the caller's transaction. Returns how many were added."""
    ids = set(user_ids)
    for uid in ids:
        db.add(Notification(user_id=uid, kind=kind, title=title, body=body, link=link, priority=priority))
    return len(ids)


def notify_each(db: Session, user_ids: Iterable[int], *, kind: str,
                render: Callable[[Language], tuple[str, str | None]], link: str | None = None,
                priority: NotificationPriority = NotificationPriority.info) -> int:
    """Like notify(), but each recipient gets the text in their own preferred language."""
    ids = set(user_ids)
    if not ids:
        return 0
    langs = dict(db.execute(select(User.id, User.preferred_language).where(User.id.in_(ids))).all())
    for uid in ids:
        title, body = render(langs.get(uid, Language.en))
        db.add(Notification(user_id=uid, kind=kind, title=title[:200], body=body, link=link, priority=priority))
    return len(ids)


def _active_ids(db: Session, role: RoleName, department_id: int | None = None) -> set[int]:
    stmt = select(User.id).join(Role).where(Role.name == role, User.is_active.is_(True))
    if department_id is not None:
        stmt = stmt.where(User.department_id == department_id)
    return set(db.scalars(stmt))


def safety_team(db: Session, *, department_id: int | None, include_admins: bool,
                reporter: User | None = None) -> set[int]:
    """Who hears about a report: the department's supervisors, the reporter's own supervisor, and for serious
    reports every admin. A report with no department goes to admins so it can't fall through the cracks."""
    ids = _active_ids(db, RoleName.supervisor, department_id) if department_id is not None else set()
    if reporter is not None and reporter.worker_profile and reporter.worker_profile.supervisor_id:
        sup = db.get(User, reporter.worker_profile.supervisor_id)
        if sup is not None and sup.is_active:
            ids.add(sup.id)
    if include_admins or not ids:
        ids |= _active_ids(db, RoleName.admin)
    if reporter is not None:
        ids.discard(reporter.id)
    return ids
