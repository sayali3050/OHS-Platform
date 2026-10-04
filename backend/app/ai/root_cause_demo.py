"""Demo AI Mode 5 Whys: a deterministic chain per incident category, so root-cause analysis can be shown offline.

Each chain deliberately ends at a system cause (design, maintenance, planning, training), never "worker error",
which is the point of the method. The incident's own words are quoted in the first answer so the chain reads as
being about this incident. Text is English: investigators work in English in this deployment (see report notes).
"""
from app.ai.schemas import RootCauseAnalysis, SuggestedAction, Why
from app.models import Incident
from app.models.enums import ControlLevel as C

# category -> (chain after the first why, root cause, contributing factors, actions)
CHAINS: dict[str, tuple[list[tuple[str, str]], str, list[str], list[tuple[str, C]]]] = {
    "slip_trip_fall": (
        [("Why was there something on the floor?", "Spills and offcuts are cleared at the end of the shift, not as they happen."),
         ("Why are they only cleared at shift end?", "No one is assigned to housekeeping during the shift and there is no spill kit nearby."),
         ("Why is there no assigned housekeeping or spill kit?", "The area's housekeeping standard was never written down after the layout changed.")],
        "No written housekeeping standard or nearby spill kit for this area, so spills stay on walkways during the shift.",
        ["Walkway shared with work activity", "Poor drainage or no drip trays", "Footwear grip not checked"],
        [("Fit drip trays or bunding at the source of the leak or spill", C.engineering),
         ("Place a spill kit within 10 m and add a mid-shift housekeeping check", C.administrative),
         ("Mark and separate the walkway from the work area", C.engineering)]),
    "fall_from_height": (
        [("Why was the person working at height that way?", "A step ladder was used because no platform was available."),
         ("Why was no platform available?", "Overhead tasks were never assessed, so suitable access equipment was not bought."),
         ("Why weren't the overhead tasks assessed?", "Work at height is not part of the area's risk assessment schedule.")],
        "Work at height in this area has never been risk-assessed, so ladders are used where a podium or platform is needed.",
        ["Time pressure", "Ladder condition not inspected", "No second person to foot the ladder"],
        [("Move the task to ground level or use extension tools where possible", C.elimination),
         ("Replace step ladders with podium steps or a mobile platform", C.substitution),
         ("Add work at height to the risk assessment and permit system", C.administrative)]),
    "struck_by": (
        [("Why did the object fall or move?", "It was stacked unevenly near the edge of the shelf."),
         ("Why was it stacked that way?", "There is no load limit or stacking rule shown on the racking."),
         ("Why are there no limits shown?", "The racking was installed without a load plan or edge protection.")],
        "Racking has no load plan, edge protection or stacking rules, so loads can sit unstable at the edge.",
        ["High picking rate", "Damaged pallets in use", "Pedestrians pass close to the racking"],
        [("Fit edge lips or mesh to the racking", C.engineering),
         ("Display load limits and stacking rules on every bay", C.administrative),
         ("Keep a pedestrian exclusion zone during put-away", C.administrative)]),
    "caught_in_machinery": (
        [("Why could a hand reach the moving part?", "The guard was off or could be opened while the machine ran."),
         ("Why could the guard be removed or opened?", "It has no interlock, and it is taken off to clear jams."),
         ("Why are jams cleared with the machine running?", "Lockout takes long and there is no safe jam-clearing procedure.")],
        "The guard has no interlock and there is no quick, safe way to clear jams, so guards get bypassed under pressure.",
        ["Frequent jams", "Production targets", "Lockout padlocks not at the machine"],
        [("Fit an interlocked guard so the machine stops when it opens", C.engineering),
         ("Fix the cause of the frequent jams", C.elimination),
         ("Write a jam-clearing procedure and keep lockout kits at the machine", C.administrative)]),
    "manual_handling": (
        [("Why was the load handled by hand?", "The lift assist was out of order or not available."),
         ("Why wasn't the lift assist available?", "It broke and the repair was not prioritised."),
         ("Why wasn't it prioritised?", "Manual handling aids are not on the planned maintenance list.")],
        "Lifting aids are not on planned maintenance and loads are not limited, so heavy loads end up being lifted by hand.",
        ["Loads above 25 kg", "Lifting from floor level", "Repetitive lifting without breaks"],
        [("Repair the lift assist and add it to planned maintenance", C.engineering),
         ("Order materials in smaller packs where possible", C.substitution),
         ("Set a 25 kg manual limit and team lifts above it", C.administrative)]),
    "cut_laceration": (
        [("Why did the edge or blade cut the person?", "Parts had sharp burrs and were handled without cut-resistant gloves."),
         ("Why were there burrs and no suitable gloves?", "Deburring is skipped when busy and gloves issued are general-purpose."),
         ("Why is this allowed to happen?", "The task's PPE and deburring steps were never specified.")],
        "Deburring and cut-resistant PPE were never specified for this task, so sharp parts are handled unprotected.",
        ["Worn knives", "Glove type not matched to the task"],
        [("Deburr parts at source before handling", C.engineering),
         ("Use safety knives with retracting blades", C.substitution),
         ("Specify and issue cut-level gloves for this task", C.ppe)]),
    "burn": (
        [("Why did the person touch something hot?", "Hot parts were placed where they could be picked up straight away."),
         ("Why were hot parts placed there?", "There is no cooling rack or hot-zone marking."),
         ("Why is there no cooling arrangement?", "Heat hazards were not considered when the process was set up.")],
        "No cooling rack or hot-zone marking was provided when the process was set up.",
        ["Gloves not heat-rated", "Rushed handling"],
        [("Add a cooling rack and mark the hot zone", C.engineering),
         ("Issue heat-rated gauntlets for this task", C.ppe)]),
    "chemical_exposure": (
        [("Why did the chemical reach the person?", "It splashed while being decanted by hand."),
         ("Why is it decanted by hand?", "There is no closed transfer pump for this drum size."),
         ("Why is there no pump?", "The task was not covered by a chemical risk assessment.")],
        "Chemicals are decanted by hand because there is no closed transfer system or task risk assessment.",
        ["Face shield not worn", "Ventilation off", "No eyewash nearby"],
        [("Install a closed transfer pump", C.engineering),
         ("Switch to a less hazardous product if available", C.substitution),
         ("Complete a chemical risk assessment and require face shields", C.administrative)]),
    "electrical": (
        [("Why was the person exposed to live parts?", "Equipment was worked on without being isolated."),
         ("Why wasn't it isolated?", "The isolation point was unclear and no lockout was applied."),
         ("Why was lockout not applied?", "Lockout-tagout is not enforced or audited in this area.")],
        "Lockout-tagout is not enforced or audited, so work starts on equipment that may still be live.",
        ["Isolation points not labelled", "Damaged cables in use"],
        [("Label every isolation point", C.engineering),
         ("Retrain on lockout-tagout and audit isolations weekly", C.administrative)]),
    "vehicle": (
        [("Why did the vehicle come near the person?", "Pedestrians and forklifts share the same aisle."),
         ("Why do they share it?", "No physical barrier or separate walkway was installed."),
         ("Why not?", "Traffic routes were never planned when the layout changed.")],
        "There is no traffic plan separating pedestrians from vehicles.",
        ["Blind corners", "Reversing without a banksman", "Speeding"],
        [("Install physical barriers and a marked pedestrian walkway", C.engineering),
         ("Fit blue spot lights and convex mirrors at blind corners", C.engineering),
         ("Set speed limits and a banksman rule for reversing", C.administrative)]),
    "near_miss": (
        [("Why did this nearly cause harm?", "The hazard was present and nothing stopped it in time."),
         ("Why was the hazard present?", "It was known informally but not reported or fixed."),
         ("Why wasn't it reported?", "Near misses are seen as not worth reporting.")],
        "Known hazards are not reported or fixed, so near misses repeat until someone is hurt.",
        ["Reporting culture", "No feedback after past reports"],
        [("Fix the condition that caused the near miss", C.engineering),
         ("Brief the team and share what was done about it", C.administrative)]),
    "other": (
        [("Why did the immediate cause occur?", "A condition or task step was unsafe."),
         ("Why was it unsafe?", "The hazard had not been identified."),
         ("Why wasn't it identified?", "The task is not covered by a current risk assessment.")],
        "The task is not covered by a current risk assessment, so its hazards were not controlled.",
        ["Unclear responsibilities", "Missing procedure"],
        [("Carry out a risk assessment for the task", C.administrative),
         ("Apply the highest practical control from the assessment", C.engineering)]),
}


def root_cause(incident: Incident) -> RootCauseAnalysis:
    chain, cause, factors, actions = CHAINS.get(incident.category or "other", CHAINS["other"])
    first = Why(question=f"Why did this happen: \"{incident.title}\"?",
                answer=(incident.description.split(".")[0].strip() or incident.title)[:300])
    return RootCauseAnalysis(
        whys=[first, *(Why(question=q, answer=a) for q, a in chain)],
        root_cause=cause,
        contributing_factors=factors + (["Someone was injured: check first-aid response time"] if incident.injury_occurred else []),
        suggested_actions=[SuggestedAction(description=d, control_level=lvl) for d, lvl in actions],
        confidence="low",  # a template can't know this site; the investigator must confirm every step
    )
