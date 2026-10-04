"""Demo AI Mode: deterministic, keyword-based suggestions so every AI workflow can be shown offline.

Outputs use the same schemas as the live model and list the words that triggered them, so it's obvious to a
viewer (and an examiner) why a suggestion was made. Keywords cover English, Hindi, Marathi and German.
"""
import re

from app.ai.schemas import HazardSuggestion, IncidentSuggestion
from app.i18n import t
from app.models.enums import HazardCategory, Language, Severity

HAZARD_WORDS: dict[HazardCategory, list[str]] = {
    HazardCategory.exposed_wire: ["wire", "cable", "spark", "socket", "live", "shock", "तार", "करंट", "बिजली", "वायर",
                                  "वीज", "kabel", "strom", "funken", "steckdose"],
    HazardCategory.chemical_leak: ["chemical", "acid", "solvent", "leak", "fumes", "vapour", "vapor", "gas", "drum",
                                   "रसायन", "केमिकल", "रिसाव", "गैस", "गळती", "chemikal", "säure", "austritt", "dämpfe"],
    HazardCategory.fire_hazard: ["fire", "smoke", "flammable", "rags", "smoking", "cigarette", "आग", "धुआँ", "बीड़ी",
                                 "सिगरेट", "धूर", "feuer", "rauch", "brennbar", "zigarette"],
    HazardCategory.blocked_exit: ["exit", "fire door", "escape route", "blocked", "निकास", "रास्ता बंद",
                                  "बाहेर पडण्याचा", "मार्ग बंद", "notausgang", "fluchtweg", "blockiert", "versperrt"],
    HazardCategory.slippery_floor: ["slippery", "slip", "wet", "oil", "spill", "water on", "फिसल", "गीला", "तेल",
                                    "निसरड", "ओल", "rutsch", "nass", "öl"],
    HazardCategory.unsafe_machine: ["machine", "guard", "conveyor", "press", "interlock", "emergency stop", "blade",
                                    "forklift", "horn", "brake", "मशीन", "गार्ड", "यंत्र", "maschine", "schutz",
                                    "stapler", "bremse"],
    HazardCategory.missing_ppe: ["ppe", "helmet", "glove", "goggle", "mask", "vest", "visor", "harness", "हेलमेट",
                                 "दस्ताने", "मास्क", "हातमोजे", "psa", "helm", "handschuh", "schutzbrille"],
    HazardCategory.excessive_noise: ["noise", "loud", "ear", "शोर", "आवाज़", "आवाज", "lärm", "laut", "gehör"],
    HazardCategory.poor_lighting: ["light", "dark", "lamp", "bulb", "flicker", "रोशनी", "अंधेरा", "बल्ब", "उजेड",
                                   "अंधार", "licht", "dunkel", "lampe", "flacker"],
    HazardCategory.unsafe_lifting: ["lift", "heavy", "carry", "sack", "bag", "weight", "stack", "उठा", "भारी", "बोरी",
                                    "वज़न", "उचल", "जड", "पोते", "heben", "schwer", "tragen", "sack"],
    HazardCategory.ergonomic: ["posture", "bend", "stoop", "back pain", "repetitive", "reach", "too low", "too high",
                               "कमर", "झुक", "पाठ", "वाक", "haltung", "bücken", "rücken", "zu niedrig"],
}

INCIDENT_WORDS: dict[str, list[str]] = {
    "near_miss": ["near miss", "almost", "nearly", "could have", "narrowly", "बाल-बाल", "बच गया", "थोडक्यात",
                  "वाचलो", "beinahe", "fast", "knapp"],
    "fall_from_height": ["ladder", "height", "scaffold", "roof", "सीढ़ी", "ऊँचाई", "शिडी", "उंची", "leiter", "höhe",
                         "gerüst"],
    "slip_trip_fall": ["slip", "trip", "fell", "fall", "फिसल", "ठोकर", "गिर", "घसर", "पडल", "rutsch", "stolper",
                       "gestürzt"],
    "caught_in_machinery": ["caught", "trapped", "pulled in", "roller", "conveyor", "फँस", "फंस", "अडक",
                            "eingeklemmt", "eingezogen"],
    "struck_by": ["hit", "struck", "fell on", "dropped", "falling", "ejected", "लगा", "टकरा", "लागल", "getroffen",
                  "herabfallend"],
    "manual_handling": ["lift", "carry", "strain", "heavy", "back", "उठा", "भारी", "कमर", "उचल", "जड", "पाठ", "heben",
                        "tragen", "rücken"],
    "cut_laceration": ["cut", "blade", "knife", "sharp", "कट", "चाकू", "धार", "कापल", "schnitt", "messer", "scharf"],
    "burn": ["burn", "hot", "spatter", "weld", "जल", "गरम", "भाजल", "verbrann", "heiß", "schweiß"],
    "chemical_exposure": ["chemical", "splash", "fumes", "solvent", "acid", "रसायन", "केमिकल", "chemikal", "säure",
                          "spritzer"],
    "electrical": ["electric", "shock", "wire", "current", "spark", "बिजली", "करंट", "वीज", "strom", "elektr"],
    "vehicle": ["forklift", "truck", "vehicle", "van", "reversed", "फोर्कलिफ्ट", "गाड़ी", "गाडी", "ट्रक",
                "fahrzeug", "stapler", "lkw"],
}

CRITICAL = ["live wire", "spark", "fire", "smoke", "trapped", "unconscious", "explosion", "gas leak", "collapse",
            "आग", "करंट", "बेहोश", "फँस", "फंस", "धूर", "बेशुद्ध", "अडक", "feuer", "eingeklemmt", "bewusstlos",
            "explosion"]
HIGH = ["injur", "hurt", "fell", "fall", "height", "ladder", "electric", "chemical", "exit", "guard", "hospital",
        "bleed", "चोट", "गिर", "ऊँचाई", "रसायन", "इजा", "पडल", "उंची", "verletz", "sturz", "höhe", "blut"]
LOW = ["minor", "small", "slight", "flicker", "bruise", "थोड़ा", "छोटा", "किरकोळ", "लहान", "gering", "klein", "leicht"]
INJURY = ["injur", "hurt", "bleed", "pain", "burn", "cut", "bruise", "sprain", "चोट", "दर्द", "खून", "जल", "इजा",
          "दुखापत", "भाजल", "verletz", "schmerz", "blut", "verbrannt", "prellung"]


def _hits(text: str, words: list[str]) -> list[str]:
    return [w for w in words if w in text]


def _severity(text: str) -> tuple[Severity, list[str]]:
    if hits := _hits(text, CRITICAL):
        return Severity.critical, hits
    if hits := _hits(text, HIGH):
        return Severity.high, hits
    if hits := _hits(text, LOW):
        return Severity.low, hits
    return Severity.medium, []


def _reason(lang: Language, words: list[str]) -> str:
    uniq = list(dict.fromkeys(words))[:6]
    return t(lang, "ai.suggest_reason", words=", ".join(f"\"{w}\"" for w in uniq)) if uniq \
        else t(lang, "ai.suggest_reason_none")


def suggest_hazard(description: str, lang: Language) -> HazardSuggestion:
    text = description.lower()
    scored = {c: _hits(text, ws) for c, ws in HAZARD_WORDS.items()}
    category = max(scored, key=lambda c: len(scored[c]))
    cat_hits = scored[category]
    if not cat_hits:
        category = HazardCategory.other
    severity, sev_hits = _severity(text)
    words = cat_hits + sev_hits
    return HazardSuggestion(category=category, severity=severity, reasoning=_reason(lang, words), keywords=words[:8])


def _title(description: str) -> str:
    first = re.split(r"(?<=[.!?।])\s+", description.strip(), maxsplit=1)[0].rstrip(".!?।")
    first = first if len(first) <= 80 else first[:77].rsplit(" ", 1)[0] + "…"
    first = first if len(first) >= 5 else (description.strip()[:80] or "Incident")
    return first[0].upper() + first[1:]


def suggest_incident(description: str, lang: Language) -> IncidentSuggestion:
    text = description.lower()
    scored = {c: _hits(text, ws) for c, ws in INCIDENT_WORDS.items()}
    category = max(scored, key=lambda c: len(scored[c]))
    cat_hits = scored[category]
    if not cat_hits:
        category = "other"
    injury = bool(_hits(text, INJURY)) and category != "near_miss"
    severity, sev_hits = _severity(text)
    if category == "near_miss" and severity == Severity.critical:
        severity = Severity.high  # nobody was hurt, but it could have been serious
    words = cat_hits + sev_hits
    return IncidentSuggestion(title=_title(description), category=category, severity=severity, injury_likely=injury,
                              reasoning=_reason(lang, words), keywords=words[:8])
