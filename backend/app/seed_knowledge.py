"""Synthetic demo SOPs for the knowledge base, so SafeAssist can show cited answers out of the box.

Fictional procedures written for this demo site; marked as demo content in their titles. Seeded only while the
knowledge base is empty.
"""
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import KnowledgeDocument

DOCS = [
    ("Forklift Operation SOP (demo)", "sop", "forklift-sop.md", """# Forklift Operation SOP

## 1. Scope
This procedure applies to everyone who drives a counterbalance forklift or reach truck in the Warehouse & Logistics department. Only people with a current forklift operator licence may drive.

## 2. Pre-use check
Before the first use in every shift, complete the Forklift pre-use check in the app. Check brakes, parking brake, horn, lights, forks, chains, seat belt and hydraulic hoses. If any item fails, park the truck, remove the key and report it to your supervisor. Never use a truck that failed its check.

## 3. Driving rules
The speed limit is 8 km/h inside the warehouse and 5 km/h in the dock area. Sound the horn at blind corners and doorways. Travel with the forks lowered to about 15 cm. Always wear the seat belt. Pedestrians have priority: stop if anyone is within 3 metres of your path.

## 4. Loading and stacking
Never lift a load heavier than the rating plate allows. Tilt the mast back before travelling with a load. Stack only on racking within its marked load limit, and never leave a load raised.

## 5. Parking
Park only in the marked bays, with forks lowered to the floor, the parking brake on and the key removed. Charge batteries only in the charging area, where smoking and naked flames are forbidden."""),
    ("Chemical Spill Response SOP (demo)", "sop", "chemical-spill-sop.md", """# Chemical Spill Response SOP

## 1. Small spills (less than 5 litres)
If you are trained and the chemical is known, put on nitrile gloves, goggles and the apron from the spill kit. Contain the spill with absorbent socks, cover it with absorbent pads, then place the used material in the yellow hazardous-waste bin. Report every spill in the app, even small ones.

## 2. Large or unknown spills
Do not try to clean it. Leave the area, warn others and close the door behind you. Raise the alarm with the siren button in the app and tell your supervisor where the spill is. Wait at the assembly point upwind of the chemical store.

## 3. Exposure first aid
Skin: remove contaminated clothing and rinse with water for at least 15 minutes using the safety shower. Eyes: use the eyewash station for at least 15 minutes, holding the eyelids open. Inhalation: move to fresh air. In every case, get a trained first aider and bring the safety data sheet.

## 4. Spill kit checks
Spill kits are checked weekly as part of the Chemical store weekly inspection. A missing or used item must be replaced the same day."""),
    ("Hot Work Permit Procedure (demo)", "policy", "hot-work-permit.md", """# Hot Work Permit Procedure

## 1. When a permit is needed
A hot work permit is required for welding, cutting, grinding or any work that produces sparks or flame outside the welding bay. The permit is issued by the supervisor of the area and is valid for one shift only.

## 2. Before starting
Remove combustible materials within 10 metres, or cover them with fire blankets. Check that a suitable fire extinguisher is within reach. Make sure smoke detectors in the area are covered only with the permission of the maintenance team.

## 3. Fire watch
A second person must keep fire watch during the work and for at least 60 minutes after it ends, checking for smouldering material. The fire watch has an extinguisher ready and does no other work.

## 4. Closing the permit
After the fire watch, the area supervisor inspects the area and signs off the permit. Keep closed permits for 12 months."""),
]


def seed_knowledge(db: Session) -> None:
    if db.scalar(select(func.count(KnowledgeDocument.id))):
        return
    from app.api.routes.knowledge import index_document
    for title, doc_type, filename, text in DOCS:
        index_document(db, title=title, doc_type=doc_type, raw=text.encode("utf-8"), filename=filename, uploaded_by=None)
    db.flush()
