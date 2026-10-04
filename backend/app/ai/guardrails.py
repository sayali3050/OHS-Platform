"""Rules enforced in code around every AI answer (architecture §4), in all four languages.

1. Classify before answering: emergency / medical_concern / safety_guidance.
   Emergencies get the fixed escalation text and a pointer to Emergency mode, never a model answer.
   Medical concerns get a fixed "not medical advice" line before any guidance.
2. No invented contacts: phone-number-like sequences are removed from model output.
"""
import re

from app.i18n import t
from app.models.enums import Language

# Words that mean "someone is in danger right now" on their own.
STRONG = [
    "unconscious", "not breathing", "can't breathe", "cannot breathe", "trapped", "electrocuted", "explosion",
    "collapsed", "heavy bleeding", "bleeding a lot", "chest pain", "heart attack",
    "बेहोश", "साँस नहीं", "सांस नहीं", "फँस गया", "फंस गया", "करंट लगा", "विस्फोट", "खून बह",
    "बेशुद्ध", "श्वास घेत नाही", "अडकला", "अडकली", "शॉक लागला", "स्फोट", "रक्त वाहत",
    "bewusstlos", "atmet nicht", "eingeklemmt", "stromschlag", "explosion", "zusammengebrochen", "stark blutet",
    "smell gas", "smell of gas", "gas smell", "smells of gas", "smelling gas", "leaking gas",
    "गैस की बदबू", "गैस की गंध", "गैस की महक", "गैस लीक हो", "गॅसचा वास", "गॅस गळत",
    "riecht nach gas", "gasgeruch",
]
# Danger words that are an emergency only with a sign it's happening now (so "fire safety training" isn't one).
DANGER = ["fire", "smoke", "gas leak", "sparks", "आग", "धुआँ", "धुंआ", "गैस लीक", "धूर", "गॅस गळती",
          "feuer", "rauch", "brennt", "gasleck"]
NOW = [" now", "help!", "need help", "please help", "there is a", "there's a", "on fire", "happening", "spreading",
       "right here", "अभी", "बचाओ", "मदद करो", "लगी है", "लग गई", "फैल रह", "आत्ता", "वाचवा", "मदत करा", "लागली",
       "पसरत", "jetzt", "hilfe!", "sofort", "breitet sich"]
MEDICAL = [
    "pain", "hurt", "dizzy", "headache", "injur", "sick", "nausea", "vomit", "rash", "bleed", "faint", "burned my",
    "cut my", "swollen", "breathless",
    "दर्द", "चक्कर", "चोट", "बीमार", "उल्टी", "सूजन", "जल गया", "कट गया", "खून",
    "दुख", "दुखत", "डोकेदुखी", "इजा", "आजारी", "उलटी", "सूज", "भाजले",
    "schmerz", "schwindel", "verletz", "übel", "kopfweh", "erbrech", "ausschlag", "geschwollen",
]

# Starts after a space or punctuation (not inside a reference like INC-2026-0042), at least 9 digits in total.
PHONE = re.compile(r"(?<![\w-])\+?\d[\d\s().-]{6,}\d(?![\w-])")


def classify(text: str) -> str:
    low = f" {text.lower()} "
    if any(w in low for w in STRONG):
        return "emergency"
    if any(w in low for w in DANGER) and any(w in low for w in NOW):
        return "emergency"
    if any(w in low for w in MEDICAL):
        return "medical_concern"
    return "safety_guidance"


def strip_numbers(text: str, lang: Language) -> str:
    """The model must never be the source of a phone number. Real contacts live in Emergency mode."""
    def swap(m: re.Match) -> str:
        return t(lang, "ai.number_removed") if sum(c.isdigit() for c in m.group()) >= 9 else m.group()
    return PHONE.sub(swap, text)


def escalation(lang: Language) -> str:
    return t(lang, "ai.escalation")


def medical_preface(lang: Language) -> str:
    return t(lang, "ai.medical")
