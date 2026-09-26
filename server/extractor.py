"""Turns one free-form citizen message (Hindi / Tamil / English / code-mixed)
into validated profile updates + an intent.

Primary path: Sarvam chat with a strict JSON-extraction prompt.
Fallback path: multilingual keyword/regex rules, so the app still works
offline or without an API key. Both paths go through profile_schema.normalize."""

import json
import re

import sarvam
from profile_schema import FIELDS, OCCUPATIONS, HOUSE_TYPES, STATES, normalize

SYSTEM_PROMPT = f"""You extract facts about a citizen for an Indian government-welfare assistant.
The citizen may write in Hindi, Tamil, English or code-mixed language (Hinglish/Tanglish), in any script.

Return ONLY a JSON object, no prose:
{{"intent": "profile" | "question" | "other", "updates": {{ ... }}}}

Rules:
- Include a field in "updates" ONLY if the citizen clearly stated it. Never guess or fill defaults.
- Allowed fields:
  name (string, in Latin script), age (integer years), gender ("male"|"female"|"other"),
  state (one of: {", ".join(STATES)}) — map cities to their state (Bengaluru -> Karnataka, Madurai -> Tamil Nadu),
  occupation (one of: {", ".join(OCCUPATIONS)}) — delivery/cab/app-based work is "gig_worker",
  annual_income (integer rupees PER YEAR for the whole household; convert "22k per month" -> 264000, "1.8 lakh" -> 180000),
  owns_land (boolean — cultivable land in their name), land_acres (number; 1 bigha ≈ 0.62 acre),
  family_size (integer), house_type ("kutcha" for mud/thatched/hut, "pucca" for brick/concrete incl. rented, "none" if homeless),
  enrolled_post_matric (boolean — studying Class 11 or above, diploma, UG or PG),
  income_tax_payer (boolean), govt_employee (boolean),
  existing_benefits (array of: pm_kisan, ayushman_bharat, tn_postmatric_scholarship, tn_housing_subsidy).
- If the message is a short answer (e.g. "5", "haan", "இல்லை") use the field the assistant just asked about.
- intent = "question" when the citizen asks something (documents, process, a scheme) instead of giving facts."""


async def extract(message: str, profile: dict, asked_field: str | None):
    """Returns (intent, updates, engine) where engine is 'sarvam' or 'rules'."""
    if sarvam.configured():
        try:
            reply = await sarvam.chat([
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": json.dumps({
                    "known_profile": profile,
                    "assistant_just_asked_about": asked_field,
                    "citizen_message": message,
                }, ensure_ascii=False)},
            ], json_mode=True)
            data = sarvam.extract_json(reply)
            intent = data.get("intent") if data.get("intent") in ("profile", "question", "other") else "profile"
            return intent, normalize(data.get("updates") or {}), "sarvam"
        except sarvam.SarvamError:
            pass  # fall through to deterministic extraction
    return fallback_extract(message, asked_field)


# ---------------------------------------------------------------- fallback ---

_DEVANAGARI_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")
_WORD_NUMBERS = {"डेढ़": 1.5, "ढाई": 2.5, "साढ़े तीन": 3.5}

_CITY_TO_STATE = {
    "bengaluru": "Karnataka", "bangalore": "Karnataka", "बेंगलुरु": "Karnataka", "mysuru": "Karnataka",
    "chennai": "Tamil Nadu", "madurai": "Tamil Nadu", "coimbatore": "Tamil Nadu", "மதுரை": "Tamil Nadu",
    "சென்னை": "Tamil Nadu", "मदुरै": "Tamil Nadu", "lucknow": "Uttar Pradesh", "लखनऊ": "Uttar Pradesh",
    "varanasi": "Uttar Pradesh", "बाराबंकी": "Uttar Pradesh", "patna": "Bihar", "पटना": "Bihar",
    "mumbai": "Maharashtra", "pune": "Maharashtra", "hyderabad": "Telangana", "kolkata": "West Bengal",
    "jaipur": "Rajasthan", "bhopal": "Madhya Pradesh",
}
_STATE_ALIASES = {
    "उत्तर प्रदेश": "Uttar Pradesh", "यूपी": "Uttar Pradesh", "tamilnadu": "Tamil Nadu", "तमिलनाडु": "Tamil Nadu",
    "தமிழ்நாடு": "Tamil Nadu", "தமிழ்நாட்டில்": "Tamil Nadu", "कर्नाटक": "Karnataka", "கர்நாடகா": "Karnataka",
    "बिहार": "Bihar", "महाराष्ट्र": "Maharashtra", "राजस्थान": "Rajasthan", "मध्य प्रदेश": "Madhya Pradesh",
}
_OCCUPATION_WORDS = {
    "farmer": ["farmer", "farming", "kisan", "kisaan", "kheti", "kisani", "किसान", "खेती", "விவசாயி", "விவசாயம்"],
    "student": ["student", "college", "छात्र", "छात्रा", "पढ़ाई", "மாணவி", "மாணவன்", "படிக்கிறேன்"],
    "gig_worker": ["delivery", "swiggy", "zomato", "uber", "ola", "rapido", "gig", "rider", "डिलीवरी", "டெலிவரி"],
    "salaried": ["salaried", "naukri", "नौकरी", "private job"],
    "unemployed": ["unemployed", "berozgar", "बेरोज़गार", "வேலை இல்லை"],
    "homemaker": ["homemaker", "housewife", "गृहिणी", "இல்லத்தரசி"],
}
_HOUSE_WORDS = {
    "kutcha": ["kutcha", "kachcha", "kacha", "कच्चा", "झोपड़ी", "குடிசை"],
    "none": ["homeless", "बेघर", "வீடு இல்லை"],
    "pucca": ["pucca", "pakka", "पक्का", "concrete", "கான்கிரீட்"],
}
# Python's word boundary treats Indic vowel signs as non-word chars, so end words explicitly.
_END = r"(?=[\s,.!?।]|$)"
_YES = r"^(yes|yeah|haan|han|ha|हाँ|हां|जी हाँ|ஆம்|ஆமாம்|aama|aamaa)" + _END
_NO = r"^(no|nahi|nahin|नहीं|नही|இல்லை|illa|illai)" + _END
_QUESTION = r"\?|^(what|how|which|when|where|why|kya|kaise|kaun|kab|क्या|कैसे|कौन|कब|என்ன|எப்படி|எந்த|எப்போது)" + _END
_MONTHLY = r"month|monthly|mahina|mahine|महीने|महीना|மாதம்|மாத"
_MONEY_UNITS = [
    (r"(\d+(?:\.\d+)?)\s*(?:lakh|lakhs|lac|लाख|லட்சம்)", 100_000),
    (r"(\d+(?:\.\d+)?)\s*(?:k\b|thousand|hazaar|hazar|हज़ार|हजार|ஆயிரம்)", 1_000),
    (r"(?:₹|rs\.?|rupees?)\s*(\d[\d,]*)", 1),
]
# A bare number counts as income only in a money context ("monthly 9000 kamati hoon").
_MONEY_CONTEXT = r"income|earn|salary|kama|kamai|kamat|कमा|आय|आमदनी|வருமானம்|சம்பா|" + _MONTHLY
# Feminine first-person verbs in Hindi/Hinglish ("rehti hoon", "करती हूँ") are a reliable gender cue.
_FEMININE = r"\b(rehti|karti|kamati|padhti|jaati) (hoon|hu|hun)\b|रहती हूँ|करती हूँ|कमाती हूँ|पढ़ती हूँ"


def _find_any(text, words):
    return any(w in text for w in words)


def _income(text):
    """Money phrases -> yearly rupees. '1 लाख 20 हज़ार' adds up; monthly amounts × 12."""
    amounts = []
    for pattern, mult in _MONEY_UNITS:
        for m in re.finditer(pattern, text):
            amounts.append((m.start(), m.end(), float(m.group(1).replace(",", "")) * mult))
    if not amounts and re.search(_MONEY_CONTEXT, text):
        amounts = [(m.start(), m.end(), float(m.group(1).replace(",", "")))
                   for m in re.finditer(r"(?<![\d.])(\d[\d,]{2,})(?![\d.]|\s*(?:acres?|bigha|years?|saal|साल|एकड़))", text)]
    if not amounts:
        return None
    amounts.sort()
    merged = [list(amounts[0])]
    for start, end, val in amounts[1:]:
        if start - merged[-1][1] <= 2:  # adjacent: "1 lakh 20 thousand"
            merged[-1][1], merged[-1][2] = end, merged[-1][2] + val
        else:
            merged.append([start, end, val])
    monthly = re.search(_MONTHLY, text)
    yearly = [v * 12 if monthly and v < 100_000 else v for _, _, v in merged]
    return int(max(yearly))


def fallback_extract(message: str, asked_field: str | None):
    text = message.translate(_DEVANAGARI_DIGITS)
    low = text.lower()
    u = {}

    if re.search(_QUESTION, low.strip()):
        return "question", {}, "rules"

    if m := re.search(r"(?:my name is|mera naam|मेरा नाम|என் பெயர்)\s+([^\d,.।]+?)(?:\s+(?:hai|है|and|aur|और)\b|[,.।]|$)", text, re.I):
        u["name"] = m.group(1).strip()
    if re.search(_FEMININE, low):
        u["gender"] = "female"
    if m := re.search(r"(\d{1,3})\s*(?:years?|yrs?|y/o|saal|sal|साल|वर्ष|வயது)", low):
        u["age"] = int(m.group(1))

    for alias, state in {**_STATE_ALIASES, **_CITY_TO_STATE}.items():
        if alias in low:
            u["state"] = state
    for state in STATES:
        if state.lower() in low:
            u["state"] = state

    for occ, words in _OCCUPATION_WORDS.items():
        if _find_any(low, words):
            u["occupation"] = occ
            break
    if re.search(r"b\.?sc|b\.?a\b|b\.?com|b\.?tech|diploma|class 1[12]|कॉलेज|கல்லூரி|படிக்கிறேன்", low):
        u["enrolled_post_matric"] = True
        u.setdefault("occupation", "student")

    if (income := _income(low)) is not None:
        u["annual_income"] = income

    if re.search(r"no land|koi zameen nahi|zameen nahi|ज़मीन नहीं|जमीन नहीं|நிலம் இல்லை|land nahi", low):
        u["owns_land"] = False
    elif m := re.search(r"(\d+(?:\.\d+)?|डेढ़|ढाई)\s*(acres?|एकड़|ஏக்கர்|bigha|बीघा)", low):
        qty = _WORD_NUMBERS.get(m.group(1)) or float(m.group(1))
        u["owns_land"] = True
        u["land_acres"] = round(qty * (0.62 if m.group(2) in ("bigha", "बीघा") else 1), 2)

    if m := re.search(r"(\d{1,2})\s*(?:members|people|persons|log|लोग|सदस्य|பேர்)", low):
        u["family_size"] = int(m.group(1))
    for house, words in _HOUSE_WORDS.items():
        if _find_any(low, words):
            u["house_type"] = house
            break
    if re.search(r"(no|nahi|नहीं)\s*(income )?tax|टैक्स भी नहीं|टैक्स नहीं", low):
        u["income_tax_payer"] = False
    if re.search(r"no govt|sarkari naukri nahi|सरकारी नौकरी नहीं", low):
        u["govt_employee"] = False

    # Short answers to the question the assistant just asked.
    if asked_field and asked_field not in u:
        kind = FIELDS.get(asked_field, (None,))[0]
        if kind == "bool":
            if re.search(_YES, low.strip()):
                u[asked_field] = True
            elif re.search(_NO, low.strip()):
                u[asked_field] = False
        elif kind == "int" and (m := re.fullmatch(r"\s*(\d[\d,]*)\s*", low)):
            u[asked_field] = int(m.group(1).replace(",", ""))
        elif asked_field == "name" and len(text.split()) <= 4 and not re.search(r"\d", text):
            u["name"] = text.strip()
        elif asked_field == "house_type" and low.strip() in HOUSE_TYPES:
            u["house_type"] = low.strip()

    return "profile", normalize(u), "rules"
