"""Run: python -m unittest discover tests"""

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "server"))

from extractor import fallback_extract  # noqa: E402
from kyc import mask_aadhaar, parse_text  # noqa: E402
from profile_schema import normalize  # noqa: E402
from retrieval import search  # noqa: E402
from rules_engine import evaluate  # noqa: E402

PERSONAS = {p["id"]: p for p in json.loads(
    (Path(__file__).resolve().parent.parent / "server" / "data" / "personas.json").read_text(encoding="utf-8"))}


def persona_profile(pid):
    profile = {}
    for turn in PERSONAS[pid]["script"]:
        profile.update(turn["updates"])
    return normalize(profile)


def statuses(profile):
    return {r["scheme_id"]: r["status"] for r in evaluate(profile)["results"]}


class PersonaOutcomes(unittest.TestCase):
    def test_farmer(self):
        self.assertEqual(statuses(persona_profile("farmer")), {
            "pm_kisan": "eligible", "ayushman_bharat": "eligible",
            "tn_postmatric_scholarship": "not_eligible", "tn_housing_subsidy": "not_eligible"})

    def test_gig_worker(self):
        self.assertEqual(statuses(persona_profile("gig")), {
            "pm_kisan": "not_eligible", "ayushman_bharat": "eligible",
            "tn_postmatric_scholarship": "not_eligible", "tn_housing_subsidy": "not_eligible"})

    def test_student_conflict(self):
        out = evaluate(persona_profile("student"))
        s = {r["scheme_id"]: r["status"] for r in out["results"]}
        self.assertEqual(s["tn_postmatric_scholarship"], "conflict")
        self.assertEqual(s["tn_housing_subsidy"], "conflict")
        self.assertEqual(len(out["conflicts"]), 1)
        # Only the larger of the conflicting pair counts toward cash value.
        self.assertEqual(out["summary"]["cash_value_inr"], 350000)


class EngineRules(unittest.TestCase):
    def test_missing_info_is_not_eligible_or_eligible(self):
        self.assertEqual(statuses({"occupation": "farmer"})["pm_kisan"], "needs_info")

    def test_hard_fail_beats_missing(self):
        self.assertEqual(statuses({"state": "Bihar"})["tn_housing_subsidy"], "not_eligible")

    def test_any_of_senior_citizen(self):
        self.assertEqual(statuses({"age": 72, "annual_income": 900000})["ayushman_bharat"], "eligible")

    def test_gap_for_what_if(self):
        res = evaluate({"state": "Tamil Nadu", "enrolled_post_matric": True, "annual_income": 260000})
        sch = next(r for r in res["results"] if r["scheme_id"] == "tn_postmatric_scholarship")
        failed = [c for c in sch["criteria"] if c["outcome"] == "fail"]
        self.assertEqual(failed[0]["gap"], 10000)

    def test_existing_benefit_conflict(self):
        p = {**persona_profile("student"), "house_type": "pucca", "existing_benefits": ["tn_housing_subsidy"]}
        self.assertEqual(statuses(p)["tn_postmatric_scholarship"], "conflict")

    def test_every_decision_is_cited(self):
        for r in evaluate(persona_profile("student"))["results"]:
            for c in r["criteria"]:
                for leaf in c.get("any_of", [c]):
                    self.assertTrue(leaf["source_clause"])

    def test_normalize_drops_garbage(self):
        self.assertEqual(normalize({"age": 400, "state": "Atlantis", "occupation": "Farmer"}), {"occupation": "farmer"})


class FallbackExtraction(unittest.TestCase):
    def test_hindi(self):
        _, u, _ = fallback_extract("मैं किसान हूँ, मेरे नाम पर ढाई एकड़ ज़मीन है। साल भर में करीब 1 लाख 20 हज़ार कमा लेता हूँ।", None)
        self.assertEqual(u["occupation"], "farmer")
        self.assertEqual(u["land_acres"], 2.5)
        self.assertEqual(u["annual_income"], 120000)

    def test_hinglish_monthly_income(self):
        _, u, _ = fallback_extract("Main 28 years ka hoon, Bengaluru mein Swiggy delivery, monthly 22k", None)
        self.assertEqual(u["age"], 28)
        self.assertEqual(u["state"], "Karnataka")
        self.assertEqual(u["occupation"], "gig_worker")
        self.assertEqual(u["annual_income"], 264000)

    def test_romanised_hindi_bare_monthly_amount(self):
        _, u, _ = fallback_extract("Kheti karti hoon, monthly 9000 kamati hoon, Patna mein rehti hoon, 3 bigha zameen", None)
        self.assertEqual(u["occupation"], "farmer")
        self.assertEqual(u["gender"], "female")
        self.assertEqual(u["annual_income"], 108000)
        self.assertEqual(u["state"], "Bihar")
        self.assertEqual(u["land_acres"], 1.86)

    def test_tamil(self):
        _, u, _ = fallback_extract("எனக்கு 19 வயது, மதுரையில் இருக்கிறேன். நாங்கள் குடிசை வீட்டில் வசிக்கிறோம்", None)
        self.assertEqual(u["age"], 19)
        self.assertEqual(u["state"], "Tamil Nadu")
        self.assertEqual(u["house_type"], "kutcha")

    def test_short_answer_uses_asked_field(self):
        self.assertEqual(fallback_extract("5", "family_size")[1], {"family_size": 5})
        self.assertEqual(fallback_extract("हाँ", "owns_land")[1], {"owns_land": True})

    def test_question_intent(self):
        self.assertEqual(fallback_extract("PM-KISAN ke liye kya documents chahiye?", None)[0], "question")


class RetrievalAndKyc(unittest.TestCase):
    def test_hindi_documents_question_hits_pm_kisan(self):
        top = search("किसान योजना के लिए दस्तावेज़")[0]
        self.assertEqual(top["id"], "pm_kisan:documents")

    def test_aadhaar_masked(self):
        self.assertEqual(mask_aadhaar("No: 1234 5678 9012"), "No: XXXX XXXX 9012")

    def test_income_certificate_ocr(self):
        import asyncio
        out = asyncio.run(parse_text("INCOME CERTIFICATE\nName: Kavya Murugan\nAnnual income Rs. 1,80,000",
                                     {"name": "Kavya Murugan", "annual_income": 180000}))
        self.assertEqual(out["doc_type"], "income_certificate")
        self.assertTrue(all(c["ok"] for c in out["checks"]))
        self.assertIn("tn_postmatric_scholarship::Income certificate (issued by Tahsildar)", out["satisfies"])


if __name__ == "__main__":
    unittest.main()
