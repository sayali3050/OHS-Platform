"""Work out which supported language a report or question was written in, so nobody has to say.

Deliberately simple and offline: the script decides Devanagari (Hindi or Marathi) versus Latin (English or
German), then common function words decide within the script. Hindi and Marathi share a script, so they are told
apart by words each uses constantly and the other almost never does. When the evidence is weak the caller falls
back to the person's preferred language, which is right far more often than a guess.
"""
import re

from app.models.enums import Language

# Explicit ranges: Python's \w doesn't treat Devanagari vowel signs as word characters, which would split words.
# The danda (U+0964, U+0965) ends a sentence, so it isn't part of a word.
_WORD = re.compile(r"[ऀ-ॣ०-ॿA-Za-zäöüßÄÖÜ]+")

_HINDI = {"है", "हैं", "था", "थी", "थे", "और", "नहीं", "में", "का", "की", "के", "को", "से", "पर", "यह", "वह",
          "गया", "गई", "गए", "रहा", "रही", "हुआ", "हुई", "मैं", "हम", "भी", "कि", "लेकिन", "बहुत", "अभी",
          "जा", "कर", "किया", "होना", "हो", "मेरा", "मेरी", "उसका", "उसकी", "वहाँ", "यहाँ", "क्या"}
_MARATHI = {"आहे", "आहेत", "होता", "होती", "होते", "आणि", "नाही", "मध्ये", "चा", "ची", "चे", "ला", "ने",
            "वर", "हे", "ते", "झाला", "झाली", "झाले", "गेला", "गेली", "मी", "आम्ही", "पण", "खूप", "आता",
            "केले", "केला", "माझा", "माझी", "त्याचा", "त्याची", "तिथे", "इथे", "काय", "पडला", "पडली", "लागली"}
_GERMAN = {"der", "die", "das", "und", "ist", "nicht", "ein", "eine", "einen", "ich", "wir", "mit", "auf",
           "zu", "im", "den", "dem", "es", "sich", "von", "bei", "wurde", "war", "hat", "haben", "auch", "aus",
           "noch", "kein", "keine", "boden", "maschine", "gefahr", "verletzt", "halle", "linie"}
_ENGLISH = {"the", "and", "is", "was", "were", "a", "an", "of", "to", "in", "on", "at", "it", "not", "with",
            "my", "i", "we", "he", "she", "they", "there", "near", "floor", "fell", "hurt", "from", "has", "have"}


def detect_language(text: str | None) -> Language | None:
    """The language `text` is written in, or None when it can't be told with reasonable confidence."""
    if not text or not text.strip():
        return None
    devanagari = sum(1 for c in text if "ऀ" <= c <= "ॿ")
    latin = sum(1 for c in text if c.isascii() and c.isalpha()) + sum(1 for c in text if c in "äöüßÄÖÜ")
    if devanagari == 0 and latin == 0:
        return None
    words = [w.lower() for w in _WORD.findall(text)]

    if devanagari >= latin:
        hi = sum(w in _HINDI for w in words)
        mr = sum(w in _MARATHI for w in words)
        # Marathi attaches case endings to nouns ("कारखान्यात", "मशीनवर"), so a few common suffixes also count.
        mr += sum(1 for w in words if len(w) > 3 and w.endswith(("ात", "ामध्ये", "ावर", "ाला", "ाची", "ाचा")))
        if hi == mr:
            return None if hi == 0 else Language.hi
        return Language.mr if mr > hi else Language.hi

    if any(c in text for c in "äöüßÄÖÜ"):
        return Language.de
    de = sum(w in _GERMAN for w in words)
    en = sum(w in _ENGLISH for w in words)
    if de == en:
        return None if en == 0 else Language.en
    return Language.de if de > en else Language.en
