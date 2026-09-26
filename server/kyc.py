"""KYC document parsing: classify an uploaded document, pull out key fields,
tick the matching checklist items and flag mismatches with the profile.

Image path: Sarvam Vision (Document Intelligence 'extract' job).
Text path:  the browser OCRs the photo (tesseract.js), masks Aadhaar numbers
            on-device, and sends only the text here."""

import json
import re

import sarvam
from profile_schema import normalize
from rules_engine import SCHEMES

DOC_TYPES = {
    # doc_type: (keywords that identify it in OCR text, keyword that identifies it in required_documents)
    "aadhaar": (["aadhaar", "आधार", "ஆதார்", "unique identification", "uidai"], "aadhaar"),
    "income_certificate": (["income certificate", "आय प्रमाण", "வருமான சான்றிதழ்", "annual income"], "income certificate"),
    "land_record": (["khatauni", "khasra", "patta", "पट्टा", "खतौनी", "பட்டா", "record of rights", "survey no"], "land ownership"),
    "ration_card": (["ration card", "राशन कार्ड", "குடும்ப அட்டை", "public distribution"], "ration card"),
    "marksheet": (["mark sheet", "marksheet", "statement of marks", "अंकपत्र", "மதிப்பெண்"], "mark sheet"),
    "bank_passbook": (["passbook", "ifsc", "account no", "पासबुक", "வங்கி"], "passbook"),
    "bonafide_certificate": (["bonafide", "bona fide", "this is to certify that", "studying in"], "bonafide"),
    "community_certificate": (["community certificate", "caste certificate", "जाति प्रमाण", "சாதிச் சான்றிதழ்"], "community certificate"),
}

VISION_SCHEMA = {
    "type": "object",
    "properties": {
        "doc_type": {"type": "string", "enum": list(DOC_TYPES) + ["other"],
                     "description": "Kind of Indian identity/KYC document shown"},
        "name": {"type": "string", "description": "Full name of the person the document belongs to, in Latin script"},
        "date_of_birth": {"type": "string", "description": "Date of birth as DD/MM/YYYY if printed"},
        "annual_income": {"type": "number", "description": "Annual income in rupees if the document states one"},
        "state": {"type": "string", "description": "Indian state from the address, full English name"},
        "land_acres": {"type": "number", "description": "Land area in acres if this is a land record"},
    },
}


def mask_aadhaar(text: str) -> str:
    return re.sub(r"\b\d{4}\s?\d{4}\s?(\d{4})\b", r"XXXX XXXX \1", text)


def _classify_by_keywords(text: str):
    low = text.lower()
    best, best_hits = "other", 0
    for doc_type, (words, _) in DOC_TYPES.items():
        hits = sum(w in low for w in words)
        if hits > best_hits:
            best, best_hits = doc_type, hits
    return best


def _fields_by_regex(text: str):
    out = {}
    if m := re.search(r"(?:name|नाम|பெயர்)\s*[:\-]\s*([A-Za-z .]{3,40})", text, re.I):
        out["name"] = m.group(1).strip()
    if m := re.search(r"(\d{2}[/-]\d{2}[/-]\d{4})", text):
        out["date_of_birth"] = m.group(1)
    if m := re.search(r"(?:income|आय|வருமானம்)[^\d₹]{0,30}(?:₹|rs\.?)?\s*([\d,]{4,})", text, re.I):
        out["annual_income"] = int(m.group(1).replace(",", ""))
    return out


async def _fields_by_llm(text: str):
    reply = await sarvam.chat([
        {"role": "system", "content": (
            "Extract fields from OCR text of an Indian KYC document. Return ONLY JSON matching this schema; "
            "omit fields that are not clearly present. Schema: " + json.dumps(VISION_SCHEMA["properties"], ensure_ascii=False)
        )},
        {"role": "user", "content": text[:4000]},
    ], json_mode=True, max_tokens=300)
    return sarvam.extract_json(reply)


def _age_from_dob(dob: str | None):
    if not dob or not (m := re.search(r"(\d{4})$", dob)):
        return None
    from datetime import date
    return date.today().year - int(m.group(1))


def review(doc_type: str, fields: dict, profile: dict, engine: str):
    """Build the response: which checklist items it satisfies and any profile mismatches."""
    doc_type = doc_type if doc_type in DOC_TYPES else "other"
    satisfies = []
    if doc_type != "other":
        key = DOC_TYPES[doc_type][1]
        for s in SCHEMES:
            satisfies += [f"{s['id']}::{d}" for d in s["required_documents"] if key in d.lower()]

    checks = []
    name = (fields.get("name") or "").strip()
    if name and profile.get("name"):
        doc_tokens = set(re.findall(r"[a-z]+", name.lower()))
        prof_tokens = set(re.findall(r"[a-z]+", profile["name"].lower()))
        if doc_tokens and prof_tokens:
            checks.append({"field": "name", "document": name, "profile": profile["name"],
                           "ok": bool(doc_tokens & prof_tokens)})
    income = normalize({"annual_income": fields.get("annual_income")}).get("annual_income")
    if income and profile.get("annual_income"):
        ok = abs(income - profile["annual_income"]) <= 0.1 * profile["annual_income"]
        checks.append({"field": "annual_income", "document": income, "profile": profile["annual_income"], "ok": ok})
    age = _age_from_dob(fields.get("date_of_birth"))
    if age and profile.get("age"):
        checks.append({"field": "age", "document": age, "profile": profile["age"], "ok": abs(age - profile["age"]) <= 1})

    return {"doc_type": doc_type, "fields": fields, "satisfies": satisfies, "checks": checks, "engine": engine}


async def parse_image(data: bytes, filename: str, mime: str, lang: str, profile: dict):
    result = await sarvam.vision_extract(data, filename, mime, VISION_SCHEMA, lang)
    fields = {k: v for k, v in result.items() if k != "doc_type" and v not in (None, "")}
    if "name" in fields:
        fields["name"] = mask_aadhaar(str(fields["name"]))
    return review(result.get("doc_type", "other"), fields, profile, "sarvam-vision")


async def parse_text(text: str, profile: dict):
    text = mask_aadhaar(text)  # defence in depth — the browser already masks
    doc_type = _classify_by_keywords(text)
    fields, engine = _fields_by_regex(text), "ocr+rules"
    if sarvam.configured():
        try:
            llm = await _fields_by_llm(text)
            fields.update({k: v for k, v in llm.items() if k != "doc_type" and v not in (None, "")})
            if doc_type == "other" and llm.get("doc_type") in DOC_TYPES:
                doc_type = llm["doc_type"]
            engine = "ocr+sarvam"
        except sarvam.SarvamError:
            pass
    return review(doc_type, fields, profile, engine)
