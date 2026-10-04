import io
import json
from datetime import datetime, timedelta, timezone

from PIL import Image
from sqlalchemy import select

from app.database.session import SessionLocal
from app.models import Attachment, AuditLog, Hazard, Notification, User
from tests.conftest import token_for


def jpeg(**exif_tags) -> bytes:
    img = Image.new("RGB", (64, 48), (200, 120, 40))
    exif = Image.Exif()
    for tag, value in exif_tags.items():
        exif[int(tag.removeprefix("t"))] = value
    buf = io.BytesIO()
    img.save(buf, "JPEG", exif=exif.tobytes())
    return buf.getvalue()


def location_id(client, h, code="WHL"):
    return next(d for d in client.get("/api/locations", headers=h).json() if d["code"] == code)["locations"][0]["id"]


def incident_payload(**over):
    body = {"title": "Pallet fell from forklift forks", "description": "A pallet slid off the forks while turning.",
            "category": "struck_by", "severity": "medium",
            "occurred_at": (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()}
    return {"payload": json.dumps({**body, **over})}


def hazard_payload(**over):
    body = {"category": "slippery_floor", "description": "Oil on the floor next to the dock door.", "severity": "medium"}
    return {"payload": json.dumps({**body, **over})}


def user_id(email):
    with SessionLocal() as db:
        return db.scalar(select(User.id).where(User.email == email))


def notifications_for(email):
    with SessionLocal() as db:
        return db.scalars(select(Notification).where(Notification.user_id == user_id(email))
                          .order_by(Notification.id.desc())).all()


# --- incidents --------------------------------------------------------------------------------------------------

def test_worker_reports_incident_with_photo_and_supervisor_is_notified(client, worker_h):
    loc = location_id(client, worker_h)
    before = len(notifications_for("supervisor@demo.com"))
    r = client.post("/api/incidents", data=incident_payload(location_id=loc), headers=worker_h,
                    files=[("photos", ("dock.jpg", jpeg(), "image/jpeg"))])
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["reference"].startswith("INC-") and body["status"] == "reported"
    assert body["reporter"]["full_name"] == "Demo Worker" and body["location"]["id"] == loc
    assert len(body["attachments"]) == 1
    sup_notes = notifications_for("supervisor@demo.com")
    assert len(sup_notes) == before + 1 and body["reference"] in sup_notes[0].body
    assert sup_notes[0].link == f"/app/reports/incidents/{body['id']}"
    assert notifications_for("worker@demo.com")[0].kind == "report_received"


def test_serious_incident_also_notifies_admins(client, worker_h):
    before = len(notifications_for("admin@demo.com"))
    r = client.post("/api/incidents", data=incident_payload(severity="critical"), headers=worker_h)
    assert r.status_code == 201
    notes = notifications_for("admin@demo.com")
    assert len(notes) == before + 1 and notes[0].priority.value == "critical"


def test_minor_incident_does_not_notify_admins(client, worker_h):
    before = len(notifications_for("admin@demo.com"))
    assert client.post("/api/incidents", data=incident_payload(severity="low"), headers=worker_h).status_code == 201
    assert len(notifications_for("admin@demo.com")) == before


def test_incident_validation_errors_are_per_field(client, worker_h):
    future = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    r = client.post("/api/incidents", data=incident_payload(occurred_at=future, injury_occurred=True, title="x"),
                    headers=worker_h)
    assert r.status_code == 422
    fields = r.json()["fields"]
    assert {"occurred_at", "injury_details", "title"} <= set(fields)


def test_unknown_location_is_a_field_error(client, worker_h):
    r = client.post("/api/incidents", data=incident_payload(location_id=99999), headers=worker_h)
    assert r.status_code == 422 and "location_id" in r.json()["fields"]


def test_reporting_requires_login(client):
    assert client.post("/api/incidents", data=incident_payload()).status_code == 401


# --- visibility -------------------------------------------------------------------------------------------------

def test_worker_sees_only_own_reports(client, worker_h):
    page = client.get("/api/incidents?page_size=100", headers=worker_h).json()
    assert page["scope"] == "own" and page["total"] > 0
    assert all(i["reporter"]["full_name"] == "Demo Worker" for i in page["items"])


def test_supervisor_sees_department_admin_sees_all(client, supervisor_h, admin_h):
    sup = client.get("/api/incidents?page_size=100", headers=supervisor_h).json()
    everyone = client.get("/api/incidents?page_size=100", headers=admin_h).json()
    assert sup["scope"] == "department" and everyone["scope"] == "all"
    assert {i["department"]["name"] for i in sup["items"]} == {"Warehouse & Logistics"}
    assert everyone["total"] > sup["total"] and everyone["total"] >= 24


def test_reports_outside_scope_are_404(client, worker_h):
    other_worker = token_for(client, "worker07@demo.com")  # Assembly Line
    other_sup = token_for(client, "supervisor.asm@demo.com")
    inc = client.post("/api/incidents", data=incident_payload(), headers=worker_h).json()
    assert client.get(f"/api/incidents/{inc['id']}", headers=worker_h).status_code == 200
    assert client.get(f"/api/incidents/{inc['id']}", headers=other_worker).status_code == 404
    assert client.get(f"/api/incidents/{inc['id']}", headers=other_sup).status_code == 404


def test_filters_and_search(client, admin_h):
    crit = client.get("/api/incidents?severity=critical&page_size=100", headers=admin_h).json()
    assert crit["items"] and all(i["severity"] == "critical" for i in crit["items"])
    found = client.get("/api/incidents?q=ladder", headers=admin_h).json()
    assert found["total"] >= 1 and "ladder" in found["items"][0]["title"].lower()


# --- hazards and anonymity --------------------------------------------------------------------------------------

def test_named_hazard_is_visible_to_reporter(client, worker_h):
    r = client.post("/api/hazards", data=hazard_payload(severity="high"), headers=worker_h)
    assert r.status_code == 201 and r.json()["reporter"]["full_name"] == "Demo Worker"
    assert r.json()["priority"] == "high"
    assert client.get(f"/api/hazards/{r.json()['id']}", headers=worker_h).status_code == 200


def test_anonymous_hazard_stores_no_identity_anywhere(client, worker_h, supervisor_h):
    r = client.post("/api/hazards", data=hazard_payload(is_anonymous=True, description="Unguarded belt on line 2."),
                    headers=worker_h, files=[("photos", ("belt.jpg", jpeg(), "image/jpeg"))])
    assert r.status_code == 201 and r.json()["reporter"] is None
    hid = r.json()["id"]
    with SessionLocal() as db:
        hazard = db.get(Hazard, hid)
        assert hazard.reporter_id is None and hazard.is_anonymous
        assert db.scalar(select(Attachment.uploaded_by).where(Attachment.hazard_id == hid)) is None
        log = db.scalar(select(AuditLog).where(AuditLog.action == "hazard.create", AuditLog.entity_id == hid))
        assert log.user_id is None and log.ip_address is None
    note = notifications_for("supervisor@demo.com")[0]
    assert "anonymously" in note.body and "Demo Worker" not in note.body
    # The supervisor can act on it; the reporter can't be linked to it, so it isn't in their own list either.
    assert client.get(f"/api/hazards/{hid}", headers=supervisor_h).json()["reporter"] is None
    assert client.get(f"/api/hazards/{hid}", headers=worker_h).status_code == 404


# --- uploads ----------------------------------------------------------------------------------------------------

def test_photo_metadata_is_stripped(client, worker_h):
    raw = jpeg(t271="SpyCam", t272="Model X", t305="PhoneOS 1.0")  # Make, Model, Software
    assert b"SpyCam" in raw
    r = client.post("/api/hazards", data=hazard_payload(), headers=worker_h,
                    files=[("photos", ("../../etc/passwd.jpg", raw, "image/jpeg"))])
    att = r.json()["attachments"][0]
    assert att["original_filename"] == "passwd.jpg"  # client path discarded
    stored = client.get(f"/api/attachments/{att['id']}", headers=worker_h)
    assert stored.status_code == 200 and stored.headers["content-type"] == "image/jpeg"
    assert b"SpyCam" not in stored.content and b"Exif" not in stored.content
    assert stored.headers["x-content-type-options"] == "nosniff"


def test_non_image_is_rejected_even_with_image_name(client, worker_h):
    r = client.post("/api/hazards", data=hazard_payload(), headers=worker_h,
                    files=[("photos", ("photo.jpg", b"<script>alert(1)</script>", "image/jpeg"))])
    assert r.status_code == 422 and "photos" in r.json()["fields"]


def test_truncated_image_is_rejected(client, worker_h):
    r = client.post("/api/hazards", data=hazard_payload(), headers=worker_h,
                    files=[("photos", ("photo.jpg", jpeg()[:200], "image/jpeg"))])
    assert r.status_code == 422 and "photos" in r.json()["fields"]


def test_too_many_photos_rejected_and_nothing_saved(client, worker_h):
    with SessionLocal() as db:
        before = db.scalar(select(Hazard.id).order_by(Hazard.id.desc()).limit(1))
    files = [("photos", (f"p{i}.jpg", jpeg(), "image/jpeg")) for i in range(4)]
    r = client.post("/api/hazards", data=hazard_payload(), headers=worker_h, files=files)
    assert r.status_code == 422 and "photos" in r.json()["fields"]
    with SessionLocal() as db:
        assert db.scalar(select(Hazard.id).order_by(Hazard.id.desc()).limit(1)) == before


def test_oversized_photo_rejected(client, worker_h, monkeypatch):
    from app.services import uploads
    monkeypatch.setattr(uploads.settings, "max_upload_mb", 0)
    r = client.post("/api/hazards", data=hazard_payload(), headers=worker_h,
                    files=[("photos", ("p.jpg", jpeg(), "image/jpeg"))])
    assert r.status_code == 422 and "MB" in r.json()["fields"]["photos"]


def test_attachment_follows_report_visibility(client, worker_h, admin_h):
    r = client.post("/api/incidents", data=incident_payload(), headers=worker_h,
                    files=[("photos", ("a.jpg", jpeg(), "image/jpeg"))])
    att_id = r.json()["attachments"][0]["id"]
    assert client.get(f"/api/attachments/{att_id}", headers=admin_h).status_code == 200
    assert client.get(f"/api/attachments/{att_id}", headers=token_for(client, "worker07@demo.com")).status_code == 404
    assert client.get(f"/api/attachments/{att_id}").status_code == 401
