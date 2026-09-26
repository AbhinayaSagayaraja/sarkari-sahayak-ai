"""Sarkari Sahayak API server (FastAPI). Also serves the web app from /web.

Run:  python server/main.py        (http://localhost:8000)"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(ROOT / ".env")

from fastapi import FastAPI, File, Form, HTTPException, UploadFile  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from pydantic import BaseModel  # noqa: E402

import extractor  # noqa: E402
import kyc  # noqa: E402
import retrieval  # noqa: E402
import sarvam  # noqa: E402
from profile_schema import normalize  # noqa: E402
from rules_engine import SCHEMES, SCHEMES_BY_ID, evaluate  # noqa: E402

PERSONAS = json.loads((Path(__file__).parent / "data" / "personas.json").read_text(encoding="utf-8"))
MAX_UPLOAD_BYTES = 8 * 1024 * 1024

app = FastAPI(title="Sarkari Sahayak API")


class ChatIn(BaseModel):
    message: str
    profile: dict = {}
    lang: str = "en"
    asked_field: str | None = None


class ProfileIn(BaseModel):
    profile: dict


class ExplainIn(BaseModel):
    scheme_id: str
    profile: dict
    lang: str = "en"


class SpeakIn(BaseModel):
    text: str
    lang: str = "en"
    source_lang: str = "en"


class KycTextIn(BaseModel):
    text: str
    profile: dict = {}


def _lang(code: str):
    return code if code in sarvam.LANG_CODES else "en"


@app.get("/api/bootstrap")
def bootstrap():
    return {
        "schemes": SCHEMES,
        "personas": PERSONAS,
        "sarvam": sarvam.configured(),
        "models": {"chat": sarvam.CHAT_MODEL, "stt": sarvam.STT_MODEL, "tts": sarvam.TTS_MODEL,
                   "translate": sarvam.TRANSLATE_MODEL},
    }


@app.post("/api/chat")
async def chat(body: ChatIn):
    """One conversational turn: extract profile facts, or answer a question from official text."""
    message = body.message.strip()[:1000]
    if not message:
        raise HTTPException(400, "empty message")
    profile = normalize(body.profile)
    intent, updates, engine = await extractor.extract(message, profile, body.asked_field)
    response = {"intent": intent, "updates": updates, "engine": engine}
    if intent == "question" or (intent == "other" and not updates):
        response.update(await retrieval.answer(message, _lang(body.lang)))
        response["intent"] = "question"
    return response


@app.post("/api/match")
def match(body: ProfileIn):
    return evaluate(normalize(body.profile))


@app.post("/api/explain")
async def explain(body: ExplainIn):
    """Plain-language explanation of ONE rules-engine decision. The LLM only rephrases;
    it receives the verdict and the cited clauses and may not change them."""
    if body.scheme_id not in SCHEMES_BY_ID:
        raise HTTPException(404, "unknown scheme")
    if not sarvam.configured():
        return {"text": None, "engine": "rules"}
    verdict = next(r for r in evaluate(normalize(body.profile))["results"] if r["scheme_id"] == body.scheme_id)
    scheme = SCHEMES_BY_ID[body.scheme_id]
    try:
        text = await sarvam.chat([
            {"role": "system", "content": (
                "Explain a government-scheme eligibility decision to a citizen with little formal education. "
                "The decision was made by a rules engine and is FINAL — do not change or question it. "
                "Use only the clauses provided, mention the key clause, keep it to 3 short sentences, warm tone, "
                f"no jargon. Reply in {retrieval.LANG_NAMES[_lang(body.lang)]}."
            )},
            {"role": "user", "content": json.dumps({
                "scheme": scheme["name"], "benefit": scheme["benefit_amount_or_type"],
                "decision": verdict["status"], "criteria": verdict["criteria"],
            }, ensure_ascii=False)},
        ], max_tokens=350, temperature=0.3)
        return {"text": text, "engine": "sarvam"}
    except sarvam.SarvamError:
        return {"text": None, "engine": "rules"}


@app.post("/api/speak")
async def speak(body: SpeakIn):
    """Translate (if needed) + Bulbul TTS. engine='browser' tells the client to use speechSynthesis."""
    lang = _lang(body.lang)
    text = body.text.strip()[:4000]
    if not sarvam.configured():
        return {"text": text, "audios": [], "engine": "browser"}
    try:
        if _lang(body.source_lang) != lang:
            text = await sarvam.translate(text, lang, source_lang=_lang(body.source_lang))
        return {"text": text, "audios": await sarvam.text_to_speech(text, lang), "engine": "sarvam"}
    except sarvam.SarvamError:
        return {"text": text, "audios": [], "engine": "browser"}


@app.post("/api/stt")
async def stt(audio: UploadFile = File(...), lang: str = Form("en")):
    if not sarvam.configured():
        raise HTTPException(503, "speech recognition needs SARVAM_API_KEY")
    data = await audio.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "audio too large")
    try:
        return await sarvam.speech_to_text(data, audio.filename or "speech.wav", audio.content_type or "audio/wav", _lang(lang))
    except sarvam.SarvamError as e:
        raise HTTPException(502, str(e))


@app.post("/api/kyc/image")
async def kyc_image(document: UploadFile = File(...), profile: str = Form("{}"), lang: str = Form("en")):
    if not sarvam.configured():
        raise HTTPException(503, "Sarvam Vision needs SARVAM_API_KEY")
    data = await document.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "document too large")
    try:
        return await kyc.parse_image(data, document.filename or "doc.jpg", document.content_type or "image/jpeg",
                                     _lang(lang), normalize(json.loads(profile)))
    except (sarvam.SarvamError, json.JSONDecodeError) as e:
        raise HTTPException(502, str(e))


@app.post("/api/kyc/text")
async def kyc_text(body: KycTextIn):
    return await kyc.parse_text(body.text[:8000], normalize(body.profile))


app.mount("/", StaticFiles(directory=ROOT / "web", html=True), name="web")


if __name__ == "__main__":
    import os

    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    # ASCII only: the Windows console (cp1252) can't print arrows or dashes.
    print(f"Sarkari Sahayak -> http://localhost:{port}   (Sarvam AI: {'ON' if sarvam.configured() else 'OFF - offline fallback mode'})")
    uvicorn.run(app, host="127.0.0.1", port=port)
