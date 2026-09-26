# Sarkari Sahayak — सरकारी सहायक — சர்க்காரி சஹாயக்

**From 1000+ schemes to YOUR schemes.**

A voice-first, multilingual assistant for Indian government welfare schemes. A citizen talks in their own language (Hindi, Tamil, English or code-mixed), by voice or text. Sahayak builds their profile live, matches them to schemes, and shows the **official clause** behind every yes or no. It also flags missing documents and schemes that conflict with each other, then drafts the application. The citizen verifies and submits it themselves.

## What makes it different

| | |
|---|---|
| 🛡️ **Rules decide, AI explains** | Eligibility comes from a deterministic rules engine (`server/rules_engine.py`), not the LLM. Every verdict carries the `source_clause` it used, rendered as a legal-style footnote. The LLM only converses, extracts facts and rephrases verdicts it can't change. |
| ⚖️ **Conflict resolver** | If you qualify for two schemes that exclude each other, you get a side-by-side comparison and **you** choose. The benefit meter counts only one of the pair. |
| 🔁 **What-if hints** | Ineligible? The engine says exactly why, for example "Your income is ₹10,000 above the ₹2,50,000 limit." |
| 🎙️ **Voice in, voice out** | Saaras speech-to-text, Sarvam Translate, and Bulbul read-outs of results in the citizen's language. |
| ✅ **Spoken field confirmation** | In the application draft, Bulbul reads each field aloud ("Age: 46. Is this correct?") and the citizen confirms by tapping or saying yes/no. |
| 🪪 **KYC scan** | Sarvam Vision (Document Intelligence) classifies the document, ticks the checklist and flags mismatches with the profile. Offline, OCR runs in the browser and **Aadhaar numbers are masked on-device** before any AI sees the text. |
| 🔍 **Grounded Q&A (RAG)** | "PM-KISAN ke liye kya documents chahiye?" is answered only from the official scheme text, with numbered citations. |
| 📴 **Works without a key** | With no API key the app falls back to multilingual rule-based extraction, the browser's speech APIs and on-device OCR. The demo never depends on the network. |

## Run it

Needs Python 3.10+.

```bash
pip install -r requirements.txt
cp .env.example .env        # then put your key in .env (optional: runs offline without it)
python server/main.py       # -> http://localhost:8000
```

Run the tests (standard library only):

```bash
python -m unittest discover tests
```

## Deploy

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/AbhinayaSagayaraja/sarkari-sahayak-ai)

`render.yaml` sets up one free web service. During setup Render asks for `SARVAM_API_KEY`: paste your key there, or leave it empty to run in offline mode. The key stays in Render's dashboard and is never committed. Free instances sleep when idle, so open the URL a minute before a demo.

## How it works

```
Browser (React + Tailwind, no build step)
  │  text / 16 kHz WAV / document photo
  ▼
FastAPI  ── /api/chat    → extractor.py (Sarvam chat JSON extraction │ regex fallback)
         │                → retrieval.py (BM25 over official text → cited answer)
         ├─ /api/match   → rules_engine.py  ← data/schemes.json   (deterministic, cited)
         ├─ /api/explain → Sarvam chat rephrases a FINAL verdict in the citizen's language
         ├─ /api/speak   → Sarvam Translate → Bulbul TTS
         ├─ /api/stt     → Saaras v3
         └─ /api/kyc/*   → Sarvam Vision extract job │ browser OCR text + masking
```

```
server/
  main.py            API routes + static hosting
  rules_engine.py    eligibility, conflicts, what-if gaps, benefit totals
  profile_schema.py  field types/validation + transparent inferences
  extractor.py       LLM extraction with multilingual rule-based fallback
  retrieval.py       tiny BM25 RAG over scheme text (Hindi/Tamil aliases)
  kyc.py             document classification, field checks, Aadhaar masking
  sarvam.py          Sarvam API client (chat, STT, translate, TTS, vision)
  data/schemes.json  the 4 schemes, with source clauses
  data/personas.json 3 scripted demo citizens
web/
  index.html, styles.css
  src/main.js        app state + flow
  src/i18n.js        every UI string in en / hi / ta
  src/audio.js       WAV recorder, Bulbul playback, browser fallbacks
  src/components/    Chrome, Chat, Profile, Results, Documents, Draft
tests/test_engine.py
```

## Assumptions and simplifications

- **Scheme data is a demo dataset.** The clauses are paraphrased from public guidelines, not verbatim legal text. The TN scholarship and housing schemes, their amounts, and the "one state DBT benefit per household" conflict rule are simplified or invented for the demo. Ayushman Bharat's SECC-2011 deprivation criteria are approximated with an income limit of ₹5 lakh or less. The data file labels all of this.
- **Only 4 schemes.** The engine and schema are generic, so adding a scheme means adding JSON.
- **Transparent inferences.** "Not an income-tax payer" is inferred when income is at or below ₹12 lakh, and "not a govt employee" is inferred for farmers, students and gig workers. The UI shows both as *inferred* with the reason, never as stated facts.
- **Sarvam models**: `sarvam-105b` (chat), `saaras:v3` (STT via `/speech-to-text`, which replaces the legacy `/speech-to-text-translate`), `sarvam-translate:v1`, `bulbul:v3`. All can be overridden in `.env`. These calls follow Sarvam's current API reference but weren't exercised against a live key during development.
- **No build step.** Node wasn't available, so the frontend is React 18 + htm via ES-module CDN, with Tailwind's Play CDN. It needs internet for those CDNs. Production would use Vite and the Tailwind CLI.
- **Nothing is stored or submitted.** The profile lives in browser memory, and the draft can only be printed or saved as PDF.
- Voice capture needs microphone permission, and browser fallbacks need Chrome or Edge for Hindi/Tamil speech recognition.

> This is assistance, not legal advice. Citizens verify and submit all applications themselves.
