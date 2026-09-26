// Conversational intake: chat bubbles, text input, mic with live waveform, demo personas.
import { useEffect, useRef, useState } from "react";
import { html } from "../lib.js";
import { Icon } from "../icons.js";
import { startRecording } from "../audio.js";

/** Live bar waveform drawn from an AnalyserNode. */
function Waveform({ analyser }) {
  const canvas = useRef(null);
  useEffect(() => {
    const c = canvas.current;
    const g = c.getContext("2d");
    const data = new Uint8Array(analyser.frequencyBinCount);
    let raf;
    const draw = () => {
      const w = (c.width = c.clientWidth * devicePixelRatio);
      const h = (c.height = c.clientHeight * devicePixelRatio);
      analyser.getByteFrequencyData(data);
      g.clearRect(0, 0, w, h);
      const bars = 40, gap = 3 * devicePixelRatio, bw = (w - gap * (bars - 1)) / bars;
      for (let i = 0; i < bars; i++) {
        // Mirror the spectrum so it looks symmetric around the centre.
        const idx = Math.floor((Math.abs(i - bars / 2) / (bars / 2)) * data.length * 0.6);
        const v = Math.max(0.08, data[idx] / 255);
        const bh = v * h * 0.9;
        g.fillStyle = `hsl(${28 + v * 10}, 90%, ${55 - v * 10}%)`;
        g.beginPath();
        g.roundRect(i * (bw + gap), (h - bh) / 2, bw, bh, bw / 2);
        g.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [analyser]);
  return html`<canvas ref=${canvas} className="w-full h-10" aria-hidden="true"></canvas>`;
}

function Bubble({ m, t }) {
  const mine = m.role === "user";
  const text = m.text ?? (m.key ? t(m.key, m.vars) : null);
  return html`<div className=${`rise flex ${mine ? "justify-end" : "justify-start"}`}>
    <div className=${`max-w-[88%] rounded-2xl px-4 py-2.5 leading-relaxed shadow-sm ${mine
      ? "bg-saffron-500 text-white rounded-br-md"
      : "bg-white dark:bg-night-800 border border-slate-200/70 dark:border-white/10 rounded-bl-md"}`}>
      ${m.voice && html`<div className="text-[11px] uppercase tracking-wide opacity-80 mb-0.5 flex items-center gap-1"><${Icon} name="mic" className="w-3 h-3" /> voice</div>`}
      ${text && html`<div className="whitespace-pre-wrap">${text}</div>`}
      ${m.citations?.length > 0 && html`
        <div className="mt-2 space-y-1.5">
          ${!m.text && html`<div className="text-xs font-semibold text-slate-500 dark:text-slate-400">${t("fromOfficial")}</div>`}
          ${m.citations.map((c) => html`
            <div key=${c.id} className="citation rounded-md pl-3 pr-2 py-1.5 text-sm bg-saffron-50/70 dark:bg-saffron-500/10">
              <sup className="font-bold text-saffron-700 dark:text-saffron-400 mr-1">[${c.n}]</sup>
              <span className="font-semibold">${c.scheme}:</span> ${c.text}
            </div>`)}
        </div>`}
    </div>
  </div>`;
}

function TypingSkeleton() {
  return html`<div className="flex justify-start" aria-label="typing">
    <div className="w-2/3 rounded-2xl rounded-bl-md bg-white dark:bg-night-800 border border-slate-200/70 dark:border-white/10 p-3 space-y-2">
      <div className="skeleton h-3 w-11/12"></div>
      <div className="skeleton h-3 w-7/12"></div>
    </div>
  </div>`;
}

export function Chat({ t, lang, messages, busy, locked, onSend, personas, onPersona, sarvamLive }) {
  const [draft, setDraft] = useState("");
  const [rec, setRec] = useState(null);         // { analyser, stop } while recording
  const [transcribing, setTranscribing] = useState(false);
  const [notice, setNotice] = useState(null);
  const scroller = useRef(null);
  const recRef = useRef(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, busy]);

  async function toggleMic() {
    setNotice(null);
    if (recRef.current) return finishRecording();
    try {
      const r = await startRecording({ lang, useSarvam: sarvamLive, onAutoStop: finishRecording });
      recRef.current = r;
      setRec(r);
    } catch (e) {
      setNotice(e.name === "NotAllowedError" ? t("micDenied") : t("micUnsupported"));
    }
  }

  async function finishRecording() {
    const r = recRef.current;
    if (!r) return;
    recRef.current = null;
    setRec(null);
    setTranscribing(true);
    try {
      const text = await r.stop();
      if (text) onSend(text, { voice: true });
    } catch {
      setNotice(t("errorGeneric"));
    } finally {
      setTranscribing(false);
    }
  }

  function submit(e) {
    e.preventDefault();
    if (!draft.trim() || locked) return;
    onSend(draft.trim());
    setDraft("");
  }

  return html`<section className="flex flex-col h-[68vh] lg:h-[calc(100vh-9.5rem)] rounded-3xl bg-slate-50/80 dark:bg-white/[0.03] border border-slate-200/70 dark:border-white/10 overflow-hidden">
    <div className="px-4 pt-4 pb-3 border-b border-slate-200/70 dark:border-white/10">
      <h2 className="font-display font-bold text-lg">${t("chatTitle")}</h2>
      <div className="mt-2 flex gap-2 overflow-x-auto no-scrollbar" role="group" aria-label=${t("demoTitle")}>
        <span className="shrink-0 self-center text-xs font-semibold text-slate-500 dark:text-slate-400">${t("demoTitle")}:</span>
        ${personas.map((p) => html`
          <button key=${p.id} onClick=${() => onPersona(p)} disabled=${locked}
            className="shrink-0 rounded-full border border-slate-300 dark:border-white/15 bg-white dark:bg-night-800 px-3 py-1 text-sm font-medium hover:border-saffron-500 hover:text-saffron-700 dark:hover:text-saffron-400 disabled:opacity-50 transition-colors">
            ${p.emoji} ${p.label[lang] || p.label.en}
          </button>`)}
      </div>
    </div>

    <div ref=${scroller} className="flex-1 overflow-y-auto p-4 space-y-3" aria-live="polite">
      ${messages.map((m) => html`<${Bubble} key=${m.id} m=${m} t=${t} />`)}
      ${(busy || transcribing) && html`<${TypingSkeleton} />`}
    </div>

    ${notice && html`<div className="mx-4 mb-2 text-sm rounded-xl bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200 px-3 py-2">${notice}</div>`}

    <form onSubmit=${submit} className="p-3 border-t border-slate-200/70 dark:border-white/10 bg-white/70 dark:bg-night-900/60 flex items-center gap-2">
      <button type="button" onClick=${toggleMic} disabled=${locked || transcribing}
        aria-label=${rec ? t("listening") : "mic"}
        className=${`relative shrink-0 w-12 h-12 rounded-full grid place-items-center text-white transition-transform active:scale-95 disabled:opacity-50 ${rec ? "mic-ring bg-rose-500" : "bg-saffron-500 hover:bg-saffron-600"}`}>
        <span className="relative z-10"><${Icon} name=${rec ? "stop" : "mic"} className="w-6 h-6" /></span>
      </button>
      ${rec
        ? html`<div className="flex-1 min-w-0 flex flex-col">
            <${Waveform} analyser=${rec.analyser} />
            <span className="text-xs text-center text-slate-500 dark:text-slate-400">${t("listening")}</span>
          </div>`
        : transcribing
          ? html`<div className="flex-1 text-sm text-slate-500 dark:text-slate-400 px-2">${t("transcribing")}</div>`
          : html`<input value=${draft} onChange=${(e) => setDraft(e.target.value)} disabled=${locked}
              placeholder=${t("placeholder")} aria-label=${t("placeholder")}
              className="flex-1 min-w-0 h-12 rounded-full px-4 bg-slate-100 dark:bg-white/10 outline-none focus:ring-2 focus:ring-saffron-500 disabled:opacity-60" />`}
      ${!rec && !transcribing && html`
        <button type="submit" disabled=${locked || !draft.trim()} aria-label=${t("send")}
          className="shrink-0 w-12 h-12 rounded-full grid place-items-center bg-ink-700 text-white disabled:opacity-40 hover:bg-ink-800">
          <${Icon} name="send" />
        </button>`}
    </form>
  </section>`;
}
