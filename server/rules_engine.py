"""Deterministic eligibility engine.

The LLM never decides eligibility. Every yes/no here is a pure function of the
profile and schemes.json, and every outcome carries the source_clause that
produced it so the UI can cite it like a legal footnote."""

import json
from datetime import datetime, timezone
from pathlib import Path

from profile_schema import infer

ENGINE_VERSION = "1.0.0"
SCHEMES = json.loads((Path(__file__).parent / "data" / "schemes.json").read_text(encoding="utf-8"))
SCHEMES_BY_ID = {s["id"]: s for s in SCHEMES}

PASS, FAIL, MISSING = "pass", "fail", "missing"


def _compare(op, actual, expected):
    if op == "eq":
        return actual == expected
    if op == "in":
        return actual in expected
    if op == "gte":
        return actual >= expected
    if op == "lte":
        return actual <= expected
    raise ValueError(f"Unknown operator: {op}")


def _gap(op, actual, expected):
    """How far a numeric value is from passing — powers the 'what-if' hint."""
    if op == "lte" and isinstance(actual, (int, float)):
        return actual - expected
    if op == "gte" and isinstance(actual, (int, float)):
        return expected - actual
    return None


def _evaluate_criterion(c, profile, inferred):
    if "any_of" in c:
        children = [_evaluate_criterion(ch, profile, inferred) for ch in c["any_of"]]
        outcomes = {ch["outcome"] for ch in children}
        outcome = PASS if PASS in outcomes else (MISSING if MISSING in outcomes else FAIL)
        return {"id": c["id"], "any_of": children, "outcome": outcome}

    field = c["field"]
    result = {k: c[k] for k in ("id", "field", "operator", "value", "source_clause")}
    if field in profile:
        actual, result["inferred"] = profile[field], None
    elif field in inferred:
        actual, reason = inferred[field]
        result["inferred"] = reason
    else:
        return {**result, "actual": None, "inferred": None, "outcome": MISSING}

    ok = _compare(c["operator"], actual, c["value"])
    result.update(actual=actual, outcome=PASS if ok else FAIL)
    if not ok:
        result["gap"] = _gap(c["operator"], actual, c["value"])
    return result


def _fold(outcomes):
    # Any hard failure wins; otherwise unknowns keep us from saying "eligible".
    if FAIL in outcomes:
        return "not_eligible"
    if MISSING in outcomes:
        return "needs_info"
    return "eligible"


def _missing_fields(criteria):
    fields = []
    for c in criteria:
        if c["outcome"] != MISSING:
            continue
        for leaf in c.get("any_of", [c]):
            if leaf["outcome"] == MISSING and leaf["field"] not in fields:
                fields.append(leaf["field"])
    return fields


def evaluate(profile: dict) -> dict:
    inferred = infer(profile)
    results = []
    for s in SCHEMES:
        criteria = [_evaluate_criterion(c, profile, inferred) for c in s["eligibility_criteria"]]
        results.append({
            "scheme_id": s["id"],
            "status": _fold([c["outcome"] for c in criteria]),
            "criteria": criteria,
            "missing_fields": _missing_fields(criteria),
            "conflicts_with_active": [],
        })

    # Conflict pass: eligible schemes that exclude each other, or that exclude
    # a benefit the citizen already receives.
    eligible = {r["scheme_id"] for r in results if r["status"] == "eligible"}
    already = set(profile.get("existing_benefits", []))
    conflicts, seen = [], set()
    for r in results:
        if r["status"] != "eligible":
            continue
        scheme = SCHEMES_BY_ID[r["scheme_id"]]
        for other in scheme["conflicts_with"]:
            if other in eligible or other in already:
                r["conflicts_with_active"].append(other)
                pair = tuple(sorted((r["scheme_id"], other)))
                if pair not in seen:
                    seen.add(pair)
                    conflicts.append({
                        "schemes": list(pair),
                        "already_availing": other if other in already else None,
                        "clause": scheme.get("conflict_clause", ""),
                    })
        if r["conflicts_with_active"]:
            r["status"] = "conflict"

    claimable = [SCHEMES_BY_ID[r["scheme_id"]] for r in results if r["status"] in ("eligible", "conflict")]
    return {
        "results": results,
        "conflicts": conflicts,
        "inferred": {k: {"value": v, "reason": why} for k, (v, why) in inferred.items()},
        "summary": {
            "eligible_count": sum(r["status"] == "eligible" for r in results),
            "conflict_count": len(conflicts),
            # Of each conflicting pair only one can be claimed, so count the larger cash value once.
            "cash_value_inr": _best_cash_total(claimable, conflicts),
            "health_cover_inr": max((s["benefit_value_inr"] for s in claimable if s["benefit_kind"] == "cover_yearly"), default=0),
        },
        "engine_version": ENGINE_VERSION,
        "evaluated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


def _best_cash_total(claimable, conflicts):
    cash = {s["id"]: s["benefit_value_inr"] for s in claimable if s["benefit_kind"].startswith("cash")}
    for c in conflicts:
        in_pair = [sid for sid in c["schemes"] if sid in cash]
        if len(in_pair) == 2:
            del cash[min(in_pair, key=cash.get)]
    return sum(cash.values())
