"""Citizen profile schema: the single source of truth for which fields exist,
their types, and how raw (LLM or regex) values are cleaned before the rules
engine ever sees them. Anything that fails validation is silently dropped —
the engine would rather say "needs info" than act on a bad value."""

OCCUPATIONS = ["farmer", "student", "gig_worker", "salaried", "self_employed", "unemployed", "homemaker", "other"]
HOUSE_TYPES = ["kutcha", "pucca", "none"]
GENDERS = ["male", "female", "other"]
STATES = [
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Delhi", "Goa", "Gujarat",
    "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra",
    "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
    "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Jammu and Kashmir", "Ladakh",
    "Puducherry",
]
SCHEME_IDS = ["pm_kisan", "ayushman_bharat", "tn_postmatric_scholarship", "tn_housing_subsidy"]

# field -> (type, allowed values or (min, max) range)
FIELDS = {
    "name": ("str", None),
    "age": ("int", (0, 120)),
    "gender": ("enum", GENDERS),
    "state": ("enum", STATES),
    "occupation": ("enum", OCCUPATIONS),
    "annual_income": ("int", (0, 100_000_000)),
    "owns_land": ("bool", None),
    "land_acres": ("float", (0, 10_000)),
    "family_size": ("int", (1, 50)),
    "house_type": ("enum", HOUSE_TYPES),
    "enrolled_post_matric": ("bool", None),
    "income_tax_payer": ("bool", None),
    "govt_employee": ("bool", None),
    "existing_benefits": ("list", SCHEME_IDS),
}

# No income tax is payable up to ₹12 lakh under the new regime (FY 2025-26).
TAX_FREE_INCOME_LIMIT = 1_200_000
NON_GOVT_OCCUPATIONS = {"farmer", "student", "gig_worker", "unemployed", "homemaker", "self_employed"}


def _coerce_bool(v):
    if isinstance(v, bool):
        return v
    if isinstance(v, str):
        s = v.strip().lower()
        if s in ("true", "yes", "y", "1", "haan", "ha"):
            return True
        if s in ("false", "no", "n", "0", "nahi", "nahin"):
            return False
    return None


def _match_enum(v, allowed):
    if not isinstance(v, str):
        return None
    s = v.strip().lower().replace("-", "_").replace(" ", "_")
    for a in allowed:
        if s == a.lower().replace(" ", "_"):
            return a
    return None


def normalize(updates: dict) -> dict:
    """Validate and coerce a dict of raw field updates. Unknown or invalid values are dropped."""
    clean = {}
    for field, raw in (updates or {}).items():
        if field not in FIELDS or raw is None or raw == "":
            continue
        kind, rule = FIELDS[field]
        try:
            if kind == "str":
                val = str(raw).strip()[:80] or None
            elif kind in ("int", "float"):
                num = float(str(raw).replace(",", "").replace("₹", ""))
                lo, hi = rule
                val = (int(round(num)) if kind == "int" else round(num, 2)) if lo <= num <= hi else None
            elif kind == "bool":
                val = _coerce_bool(raw)
            elif kind == "enum":
                val = _match_enum(raw, rule)
            elif kind == "list":
                items = raw if isinstance(raw, list) else [raw]
                val = [i for i in (_match_enum(x, rule) for x in items) if i]
        except (TypeError, ValueError):
            val = None
        if val is not None:
            clean[field] = val
    return clean


def infer(profile: dict) -> dict:
    """Derive a few fields the citizen shouldn't have to be asked about.
    Returns {field: (value, reason)}; the UI shows these as 'inferred', never as stated facts."""
    out = {}
    occ = profile.get("occupation")
    income = profile.get("annual_income")
    if "income_tax_payer" not in profile and income is not None and income <= TAX_FREE_INCOME_LIMIT:
        out["income_tax_payer"] = (False, "income below ₹12 lakh tax-free limit")
    if "govt_employee" not in profile and occ in NON_GOVT_OCCUPATIONS:
        out["govt_employee"] = (False, f"occupation is {occ}")
    if "enrolled_post_matric" not in profile and occ and occ != "student":
        out["enrolled_post_matric"] = (False, "not a student")
    if "owns_land" not in profile and occ and occ != "farmer":
        # Only matters for PM-KISAN, which already fails on occupation — safe default.
        out["owns_land"] = (False, "not a farmer")
    return out

