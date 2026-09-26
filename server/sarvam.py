"""Thin async client for the Sarvam AI APIs used by Sarkari Sahayak.

Every call raises SarvamError on failure; callers decide on a fallback so the
demo keeps working on bad Wi-Fi or without a key."""

import asyncio
import json
import os
import re

import httpx

BASE_URL = os.getenv("SARVAM_BASE_URL", "https://api.sarvam.ai").rstrip("/")
CHAT_MODEL = os.getenv("SARVAM_CHAT_MODEL", "sarvam-105b")
STT_MODEL = os.getenv("SARVAM_STT_MODEL", "saaras:v3")
TRANSLATE_MODEL = os.getenv("SARVAM_TRANSLATE_MODEL", "sarvam-translate:v1")
TTS_MODEL = os.getenv("SARVAM_TTS_MODEL", "bulbul:v3")
TTS_SPEAKER = os.getenv("SARVAM_TTS_SPEAKER", "priya")

LANG_CODES = {"en": "en-IN", "hi": "hi-IN", "ta": "ta-IN"}
TRANSLATE_CHUNK = 1800  # sarvam-translate:v1 accepts up to 2000 chars
TTS_CHUNK = 2000        # bulbul:v3 accepts up to 2500 chars


class SarvamError(Exception):
    pass


def api_key():
    return os.getenv("SARVAM_API_KEY", "").strip()


def configured():
    key = api_key()
    return bool(key) and key != "your_key_here"


def _headers():
    return {"api-subscription-key": api_key()}


async def _post(path, *, json_body=None, data=None, files=None, timeout=45):
    if not configured():
        raise SarvamError("SARVAM_API_KEY not set")
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.post(f"{BASE_URL}{path}", headers=_headers(), json=json_body, data=data, files=files)
    except httpx.HTTPError as e:
        raise SarvamError(f"network error on {path}: {e}") from e
    if r.status_code >= 400:
        raise SarvamError(f"{path} -> HTTP {r.status_code}: {r.text[:300]}")
    return r.json()


def _chunks(text, limit):
    """Split on sentence boundaries (incl. Devanagari danda) so each chunk fits the API limit."""
    parts, cur = [], ""
    for sentence in re.split(r"(?<=[.!?।])\s+", text.strip()):
        if len(cur) + len(sentence) + 1 > limit and cur:
            parts.append(cur)
            cur = ""
        cur = f"{cur} {sentence}".strip()
        while len(cur) > limit:  # a single very long sentence
            parts.append(cur[:limit])
            cur = cur[limit:]
    if cur:
        parts.append(cur)
    return parts


def extract_json(text):
    """Pull the first JSON object out of an LLM reply (tolerates <think> blocks and code fences)."""
    text = re.sub(r"<think>.*?</think>", "", text or "", flags=re.S)
    match = re.search(r"\{.*\}", text, flags=re.S)
    if not match:
        raise SarvamError("no JSON object in model reply")
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError as e:
        raise SarvamError(f"invalid JSON from model: {e}") from e


async def chat(messages, *, json_mode=False, max_tokens=700, temperature=0.1):
    body = {
        "model": CHAT_MODEL,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "reasoning_effort": "low",
    }
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    data = await _post("/v1/chat/completions", json_body=body)
    try:
        content = data["choices"][0]["message"]["content"] or ""
    except (KeyError, IndexError) as e:
        raise SarvamError("unexpected chat response shape") from e
    return re.sub(r"<think>.*?</think>", "", content, flags=re.S).strip()


async def speech_to_text(audio: bytes, filename: str, mime: str, lang: str | None):
    """Saaras v3 transcription. Returns {'transcript', 'language_code'}."""
    data = {"model": STT_MODEL, "mode": "transcribe", "language_code": LANG_CODES.get(lang, "unknown")}
    res = await _post("/speech-to-text", data=data, files={"file": (filename, audio, mime)})
    return {"transcript": res.get("transcript", ""), "language_code": res.get("language_code")}


async def translate(text: str, target_lang: str, source_lang: str = "en"):
    if target_lang == source_lang:
        return text
    out = []
    for chunk in _chunks(text, TRANSLATE_CHUNK):
        res = await _post("/translate", json_body={
            "input": chunk,
            "source_language_code": LANG_CODES.get(source_lang, "auto"),
            "target_language_code": LANG_CODES[target_lang],
            "model": TRANSLATE_MODEL,
        })
        out.append(res.get("translated_text", ""))
    return " ".join(out)


async def text_to_speech(text: str, lang: str):
    """Bulbul TTS. Returns a list of base64 WAV clips to be played in order."""
    audios = []
    for chunk in _chunks(text, TTS_CHUNK):
        res = await _post("/text-to-speech", json_body={
            "text": chunk,
            "language_code": LANG_CODES.get(lang, "en-IN"),
            "model": TTS_MODEL,
            "speaker": TTS_SPEAKER,
            "pace": 0.95,
        })
        audios.extend(res.get("audios", []))
    return audios


async def vision_extract(doc: bytes, filename: str, mime: str, schema: dict, lang: str, poll_seconds=40):
    """Sarvam Vision (Document Intelligence) field extraction: submit job, poll, fetch results."""
    job = await _post("/doc-ai/v1/job/extract", data={
        "schema": json.dumps(schema),
        "language": LANG_CODES.get(lang, "en-IN"),
    }, files={"file": (filename, doc, mime)}, timeout=60)
    job_id = job.get("job_id")
    if not job_id:
        raise SarvamError("vision job not created")

    async with httpx.AsyncClient(timeout=20) as client:
        for _ in range(poll_seconds):
            status = (await client.get(f"{BASE_URL}/doc-ai/v1/job/{job_id}/status", headers=_headers())).json()
            state = status.get("status", status.get("job_state", "")).lower()
            if state in ("completed", "partially_completed"):
                res = await client.get(f"{BASE_URL}/doc-ai/v1/job/{job_id}/results", headers=_headers(), params={"format": "json"})
                if res.status_code >= 400:
                    raise SarvamError(f"vision results HTTP {res.status_code}")
                return res.json().get("result") or {}
            if state in ("failed", "rejected"):
                raise SarvamError(f"vision job {state}")
            await asyncio.sleep(1)
    raise SarvamError("vision job timed out")
