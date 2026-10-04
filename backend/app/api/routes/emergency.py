"""Emergency mode: guidance and real numbers, the site-wide alarm, the roll call, and site contacts."""
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user, require_admin, require_staff
from app.database.session import get_db
from app.i18n import t
from app.models import EmergencyContact, EmergencyEvent, User
from app.models.enums import Language
from app.schemas.emergency import (
    ActiveEmergency, EmergencyAlertIn, EmergencyAlertOut, EmergencyInfo, ResolveIn, RespondIn, RollCall,
    SiteContactIn, SiteContactOut,
)
from app.services import audit, emergency
from app.services.uploads import UploadRejected, read_voice, store_audio
from app.utils.forms import field_error
from app.utils.rate_limit import emergency_limiter, per_user_limit

router = APIRouter(prefix="/emergency", tags=["Emergency"])


@router.get("", response_model=EmergencyInfo,
            summary="General guidance, site numbers, your supervisor and national emergency numbers, in your language")
def emergency_info(user: User = Depends(get_current_user), db: Session = Depends(get_db),
                   lang: Language | None = Query(None, description="Override the user's preferred language")):
    lang = lang or user.preferred_language
    contacts = emergency.contacts_for(db, user, lang)
    return EmergencyInfo(
        first_step=t(lang, "emergency.first_step"), contacts=contacts,
        contacts_configured=any(c["kind"] == "site" for c in contacts), guides=emergency.guides(lang),
    )


@router.post("/alert", response_model=EmergencyAlertOut, status_code=201,
             summary="Sound the alarm for everyone, start a roll call and open a critical incident")
def emergency_alert(body: EmergencyAlertIn, request: Request, db: Session = Depends(get_db),
                    user: User = Depends(per_user_limit(emergency_limiter)), lang: Language | None = None):
    try:
        event, notified = emergency.raise_alert(db, user, body.emergency_type, body.location_id, body.notes)
    except ValueError as e:
        raise field_error("location_id", str(e))
    audit.record(db, "emergency.alert", user_id=user.id, entity_type="emergency_event", entity_id=event.id,
                 details={"type": body.emergency_type.value, "incident_id": event.incident_id}, request=request)
    db.commit()
    return EmergencyAlertOut(id=event.id, notified=notified,
                             message=emergency.alert_message(lang or user.preferred_language, notified))


def _event(db: Session, event_id: int) -> EmergencyEvent:
    event = db.get(EmergencyEvent, event_id)
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Emergency not found")
    return event


@router.get("/active", response_model=list[ActiveEmergency],
            summary="Emergencies sounding right now. The app polls this to show the alarm on every screen.")
def active(user: User = Depends(get_current_user), db: Session = Depends(get_db), lang: Language | None = None):
    lang = lang or user.preferred_language
    return [emergency.describe(db, e, user, lang) for e in emergency.active_events(db)]


@router.post("/{event_id}/respond", response_model=ActiveEmergency, summary="Answer the roll call: safe or need help")
def respond(event_id: int, body: RespondIn, request: Request, user: User = Depends(get_current_user),
            db: Session = Depends(get_db), lang: Language | None = None):
    event = _event(db, event_id)
    if not emergency.is_active(event):
        raise HTTPException(status.HTTP_409_CONFLICT, "This emergency is over.")
    emergency.respond(db, event, user, body.status)
    audit.record(db, "emergency.respond", user_id=user.id, entity_type="emergency_event", entity_id=event.id,
                 details={"status": body.status}, request=request)
    db.commit()
    return emergency.describe(db, event, user, lang or user.preferred_language)


@router.post("/{event_id}/resolve", status_code=204, summary="Stop the alarm for everyone (supervisors and admins)")
def resolve(event_id: int, body: ResolveIn, request: Request, user: User = Depends(require_staff),
            db: Session = Depends(get_db)):
    event = _event(db, event_id)
    if event.resolved_at is not None:
        return
    emergency.resolve(db, event, user, (body.note or "").strip() or None)
    audit.record(db, "emergency.resolve", user_id=user.id, entity_type="emergency_event", entity_id=event.id,
                 details={"note": body.note}, request=request)
    db.commit()


@router.get("/{event_id}/roll-call", response_model=RollCall, summary="Who is safe, who needs help, who hasn't answered")
def roll_call(event_id: int, user: User = Depends(require_staff), db: Session = Depends(get_db)):
    event = _event(db, event_id)
    return RollCall(event=emergency.describe(db, event, user, user.preferred_language),
                    people=emergency.roll_call(db, event))


@router.post("/{event_id}/voice", status_code=201, summary="Add a voice note to an alert you raised")
def add_voice(event_id: int, request: Request, voice: UploadFile = File(...), user: User = Depends(get_current_user),
              db: Session = Depends(get_db)):
    event = _event(db, event_id)
    if event.user_id != user.id or not emergency.is_active(event):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Emergency not found")
    try:
        audio = read_voice(voice)
    except UploadRejected as e:
        raise field_error("voice", str(e))
    if audio is None:
        raise field_error("voice", "Record a voice note first.")
    att = store_audio(audio, emergency_event_id=event.id, incident_id=event.incident_id, uploaded_by=user.id)
    db.add(att)
    db.flush()
    audit.record(db, "emergency.voice", user_id=user.id, entity_type="emergency_event", entity_id=event.id,
                 request=request)
    db.commit()
    return {"id": att.id}


# --- site numbers (admins) --------------------------------------------------------------------------------------

@router.get("/contacts", response_model=list[SiteContactOut], summary="Site numbers added in the app")
def list_contacts(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    return db.scalars(select(EmergencyContact).order_by(EmergencyContact.sort_order, EmergencyContact.id)).all()


@router.post("/contacts", response_model=SiteContactOut, status_code=201, summary="Add a site emergency number")
def add_contact(body: SiteContactIn, request: Request, admin: User = Depends(require_admin),
                db: Session = Depends(get_db)):
    contact = EmergencyContact(label=body.label.strip(), phone=body.phone.strip(),
                               sort_order=len(emergency.site_contacts(db)))
    db.add(contact)
    db.flush()
    audit.record(db, "emergency.contact_add", user_id=admin.id, entity_type="emergency_contact", entity_id=contact.id,
                 details={"label": contact.label}, request=request)
    db.commit()
    return contact


@router.delete("/contacts/{contact_id}", status_code=204, summary="Remove a site emergency number")
def delete_contact(contact_id: int, request: Request, admin: User = Depends(require_admin),
                   db: Session = Depends(get_db)):
    contact = db.get(EmergencyContact, contact_id)
    if contact is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contact not found")
    db.delete(contact)
    audit.record(db, "emergency.contact_delete", user_id=admin.id, entity_type="emergency_contact",
                 entity_id=contact_id, request=request)
    db.commit()
