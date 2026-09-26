// Voice in / voice out.
//  In:  Web Audio capture -> 16 kHz mono WAV -> Sarvam Saaras (server),
//       or the browser's SpeechRecognition when no Sarvam key is configured.
//  Out: Sarvam Bulbul audio clips, or speechSynthesis as fallback.
import { api } from "./lib.js";

const BCP47 = { en: "en-IN", hi: "hi-IN", ta: "ta-IN" };
const TARGET_RATE = 16000;
const MAX_SECONDS = 25; // Saaras REST accepts up to 30 s

function encodeWav(chunks, inputRate) {
  // Downsample by averaging, then write 16-bit PCM with a WAV header.
  const input = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of chunks) { input.set(c, o); o += c.length; }
  const ratio = inputRate / TARGET_RATE;
  const samples = new Int16Array(Math.floor(input.length / ratio));
  for (let i = 0; i < samples.length; i++) {
    const start = Math.floor(i * ratio), end = Math.min(Math.floor((i + 1) * ratio), input.length);
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    const s = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
    samples[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const w = (off, str) => [...str].forEach((ch, i) => v.setUint8(off + i, ch.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); w(8, "WAVE");
  w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, TARGET_RATE, true); v.setUint32(28, TARGET_RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, samples.length * 2, true);
  new Int16Array(buf, 44).set(samples);
  return new Blob([buf], { type: "audio/wav" });
}

/**
 * Start recording. Returns { analyser, stop } where stop() resolves to the transcript.
 * `useSarvam` picks Saaras (server) vs the browser recogniser.
 */
export async function startRecording({ lang, useSarvam, onAutoStop }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!navigator.mediaDevices?.getUserMedia || (!useSarvam && !SR)) throw new Error("unsupported");

  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);

  const chunks = [];
  let processor = null, recognition = null, browserText = "";
  if (useSarvam) {
    processor = ctx.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    source.connect(processor);
    processor.connect(ctx.destination);
  } else {
    recognition = new SR();
    recognition.lang = BCP47[lang];
    recognition.interimResults = false;
    recognition.continuous = true;
    recognition.onresult = (e) => {
      browserText = [...e.results].map((r) => r[0].transcript).join(" ");
    };
    recognition.start();
  }

  const timer = setTimeout(() => onAutoStop?.(), MAX_SECONDS * 1000);

  async function stop() {
    clearTimeout(timer);
    stream.getTracks().forEach((tr) => tr.stop());
    processor?.disconnect();
    if (recognition) {
      await new Promise((resolve) => { recognition.onend = resolve; recognition.stop(); });
    }
    await ctx.close();
    if (!useSarvam) return browserText.trim();

    const form = new FormData();
    form.append("audio", encodeWav(chunks, ctx.sampleRate), "speech.wav");
    form.append("lang", lang);
    const res = await api("stt", form);
    return (res.transcript || "").trim();
  }

  return { analyser, stop };
}

// ---- playback ---------------------------------------------------------------

let current = { cancelled: true, audio: null };

export function stopSpeaking() {
  current.cancelled = true;
  current.audio?.pause();
  window.speechSynthesis?.cancel();
}

/**
 * Speak text in `lang`. When sourceLang differs, the server translates first (Sarvam Translate).
 * Resolves with the text actually spoken (useful as a caption) once playback ends.
 */
export async function speak(text, lang, sourceLang = lang) {
  stopSpeaking();
  const session = { cancelled: false, audio: null };
  current = session;

  let res;
  try {
    res = await api("speak", { text, lang, source_lang: sourceLang });
  } catch {
    res = { text, audios: [], engine: "browser" };
  }
  if (session.cancelled) return res.text;

  if (res.audios?.length) {
    for (const b64 of res.audios) {
      if (session.cancelled) break;
      session.audio = new Audio(`data:audio/wav;base64,${b64}`);
      await new Promise((resolve) => {
        session.audio.onended = resolve;
        session.audio.onerror = resolve;
        session.audio.onpause = resolve;
        session.audio.play().catch(resolve);
      });
    }
    return res.text;
  }

  // Browser fallback can't translate, so the caller passes already-localised text.
  if (!window.speechSynthesis) return res.text;
  await new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(res.text);
    u.lang = BCP47[lang];
    const voice = speechSynthesis.getVoices().find((v) => v.lang === u.lang);
    if (voice) u.voice = voice;
    u.onend = resolve;
    u.onerror = resolve;
    speechSynthesis.speak(u);
  });
  return res.text;
}
