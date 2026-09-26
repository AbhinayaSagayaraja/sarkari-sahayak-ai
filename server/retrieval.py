"""Tiny BM25 retriever over the official scheme text in schemes.json.

Questions like "PM-KISAN ke liye kaunse documents chahiye?" are answered ONLY
from these passages, and every answer cites the passage ids it used."""

import math
import re
from collections import Counter

import sarvam
from rules_engine import SCHEMES

# Multilingual aliases so Hindi/Tamil questions still hit English passages
# even when translation is unavailable.
_ALIASES = {
    "pm_kisan": "pm kisan किसान किसान सम्मान निधि விவசாயி கிசான்",
    "ayushman_bharat": "ayushman pmjay health hospital आयुष्मान इलाज अस्पताल ஆயுஷ்மான் மருத்துவம் காப்பீடு",
    "tn_postmatric_scholarship": "scholarship student छात्रवृत्ति स्कॉलरशिप உதவித்தொகை மாணவர்",
    "tn_housing_subsidy": "housing house home आवास मकान घर வீடு வீட்டு",
}
_TOPIC_ALIASES = {
    "documents": "documents papers दस्तावेज़ कागज़ कागजात ஆவணங்கள் சான்றிதழ்",
    "benefit": "benefit amount money कितना पैसा लाभ தொகை பலன்",
    "apply": "apply where how आवेदन कहाँ कैसे விண்ணப்பம் எங்கே",
    "eligibility": "eligible eligibility who पात्र पात्रता யார் தகுதி",
}


def _tokens(text):
    # \w alone splits Hindi/Tamil words at vowel signs; include the whole script blocks.
    return re.findall(r"[\wऀ-ॿ஀-௿]+", text.lower())


def _build_passages():
    passages = []
    for s in SCHEMES:
        alias = f"{s['short_name']} {_ALIASES.get(s['id'], '')}"

        def add(kind, text, topic=""):
            passages.append({
                "id": f"{s['id']}:{kind}",
                "scheme_id": s["id"],
                "scheme": s["short_name"],
                "text": text,
                "index_text": f"{alias} {_TOPIC_ALIASES.get(topic, '')} {text}",
            })

        add("about", s["description"], "eligibility")
        add("benefit", f"Benefit: {s['benefit_amount_or_type']}. Processing: {s['processing_time']}.", "benefit")
        add("documents", "Required documents: " + "; ".join(s["required_documents"]) + ".", "documents")
        add("apply", f"Where to apply: {s['apply_at']}.", "apply")
        for c in s["eligibility_criteria"]:
            for leaf in c.get("any_of", [c]):
                add(leaf["id"], leaf["source_clause"], "eligibility")
        if s.get("conflict_clause"):
            add("conflict", s["conflict_clause"])
    return passages


PASSAGES = _build_passages()
_DOC_TOKENS = [Counter(_tokens(p["index_text"])) for p in PASSAGES]
_AVG_LEN = sum(sum(t.values()) for t in _DOC_TOKENS) / len(_DOC_TOKENS)
_DF = Counter(tok for doc in _DOC_TOKENS for tok in doc)


def search(query: str, k=4):
    q = _tokens(query)
    n = len(PASSAGES)
    scored = []
    for p, doc in zip(PASSAGES, _DOC_TOKENS):
        length = sum(doc.values())
        score = 0.0
        for tok in q:
            if tok not in doc:
                continue
            idf = math.log(1 + (n - _DF[tok] + 0.5) / (_DF[tok] + 0.5))
            tf = doc[tok]
            score += idf * tf * 2.2 / (tf + 1.2 * (0.25 + 0.75 * length / _AVG_LEN))
        if score > 0:
            scored.append((score, p))
    scored.sort(key=lambda x: -x[0])
    return [p for _, p in scored[:k]]


LANG_NAMES = {"en": "English", "hi": "Hindi (Devanagari script)", "ta": "Tamil (Tamil script)"}


async def answer(question: str, lang: str):
    """Grounded answer. Returns {'answer', 'citations', 'engine'}."""
    query = question
    if sarvam.configured() and lang != "en":
        try:
            query = f"{question} {await sarvam.translate(question, 'en', source_lang=lang)}"
        except sarvam.SarvamError:
            pass
    hits = search(query)
    citations = [{"n": i + 1, "id": p["id"], "scheme": p["scheme"], "text": p["text"]} for i, p in enumerate(hits)]
    if not hits:
        return {"answer": None, "citations": [], "engine": "rules"}

    if sarvam.configured():
        context = "\n".join(f"[{c['n']}] ({c['scheme']}) {c['text']}" for c in citations)
        try:
            text = await sarvam.chat([
                {"role": "system", "content": (
                    "You help Indian citizens understand government schemes. Answer ONLY using the numbered "
                    "official passages given. Cite passages inline like [1]. If the passages do not contain the "
                    "answer, say so and suggest the official portal. Never invent amounts, rules or documents. "
                    f"Reply in {LANG_NAMES.get(lang, 'English')}, in 2-4 short, simple sentences."
                )},
                {"role": "user", "content": f"Official passages:\n{context}\n\nCitizen's question: {question}"},
            ], max_tokens=400, temperature=0.2)
            return {"answer": text, "citations": citations, "engine": "sarvam"}
        except sarvam.SarvamError:
            pass
    # Without the LLM, show the best passages verbatim — still fully cited.
    return {"answer": None, "citations": citations[:2], "engine": "rules"}
