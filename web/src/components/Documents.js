// Documents checklist + KYC scan. Scanning ticks matching items and flags
// mismatches between the document and what the citizen told us.
import { useRef, useState } from "react";
import { api, html, showValue } from "../lib.js";
import { Icon } from "../icons.js";

const TESSERACT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
const OCR_LANGS = { en: "eng", hi: "eng+hin", ta: "eng+tam" };

function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = TESSERACT_URL;
    s.onload = () => resolve(window.Tesseract);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

/** Mask 12-digit Aadhaar numbers on-device, before the text leaves the browser. */
const maskAadhaar = (text) => text.replace(/\b\d{4}\s?\d{4}\s?(\d{4})\b/g, "XXXX XXXX $1");

async function ocrParse(file, lang, profile, onProgress) {
  const Tesseract = await loadTesseract();
  const { data } = await Tesseract.recognize(file, OCR_LANGS[lang], {
    logger: (m) => m.status === "recognizing text" && onProgress(Math.round(m.progress * 100)),
  });
  return api("kyc/text", { text: maskAadhaar(data.text), profile });
}

export const docKey = (schemeId, doc) => `${schemeId}::${doc}`;

export function Documents({ t, lang, schemes, profile, docs, setDocs, sarvamLive }) {
  const input = useRef(null);
  const [scan, setScan] = useState(null); // { status: 'reading'|'done'|'error', pct, result }

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setScan({ status: "reading", pct: 0 });
    try {
      let result;
      if (sarvamLive) {
        const form = new FormData();
        form.append("document", file);
        form.append("profile", JSON.stringify(profile));
        form.append("lang", lang);
        result = await api("kyc/image", form).catch(() => null);
      }
      result ??= await ocrParse(file, lang, profile, (pct) => setScan({ status: "reading", pct }));
      setDocs((d) => new Set([...d, ...result.satisfies]));
      setScan({ status: "done", result });
    } catch {
      setScan({ status: "error" });
    }
  }

  const toggle = (key) => setDocs((d) => {
    const next = new Set(d);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  return html`<section className="rounded-3xl bg-white dark:bg-night-800 border border-slate-200/70 dark:border-white/10 p-4 sm:p-6 shadow-sm slide-up">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="font-display font-bold text-xl">${t("docsTitle")}</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">${t("docsSub")}</p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <button onClick=${() => input.current.click()} disabled=${scan?.status === "reading"}
          className="inline-flex items-center gap-2 rounded-full px-4 py-2 font-semibold bg-ink-700 text-white hover:bg-ink-800 disabled:opacity-60">
          <${Icon} name="scan" /> ${t("scan")}
        </button>
        <input ref=${input} type="file" accept=${sarvamLive ? "image/*,application/pdf" : "image/*"} className="hidden" onChange=${onFile} />
        <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1"><${Icon} name="shield" className="w-3 h-3" /> ${t("aadhaarMasked")}</span>
      </div>
    </div>

    ${scan?.status === "reading" && html`<div className="mt-4 rounded-2xl border border-slate-200 dark:border-white/10 p-4 space-y-2">
      <div className="text-sm font-semibold">${t("scanning", { pct: scan.pct ? `${scan.pct}%` : "" })}</div>
      <div className="skeleton h-3 w-full"></div><div className="skeleton h-3 w-2/3"></div>
    </div>`}
    ${scan?.status === "error" && html`<div className="mt-4 rounded-2xl bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-200 p-3 text-sm">${t("errorGeneric")}</div>`}
    ${scan?.status === "done" && html`<div className="rise mt-4 rounded-2xl border border-leaf-500/40 bg-leaf-50/60 dark:bg-leaf-600/10 p-4">
      <div className="font-semibold flex items-center gap-2"><${Icon} name="doc" className="w-4 h-4" /> ${t("detected", { type: t(`docTypes.${scan.result.doc_type}`) })}
        <span className="ml-auto text-[11px] font-mono text-slate-500">${scan.result.engine}</span></div>
      <ul className="mt-2 space-y-1 text-sm">
        ${scan.result.checks.map((c) => html`<li key=${c.field} className=${`flex items-start gap-1.5 ${c.ok ? "text-leaf-700 dark:text-leaf-100" : "text-amber-800 dark:text-amber-200"}`}>
          <${Icon} name=${c.ok ? "check" : "alert"} className="w-4 h-4 mt-0.5 shrink-0" />
          <span><b>${t(`fields.${c.field}`)}</b>: ${showValue(t, c.field, c.document)} — ${c.ok ? t("matches") : t("mismatch", { profile: showValue(t, c.field, c.profile) })}</span>
        </li>`)}
      </ul>
    </div>`}

    <div className="mt-5 grid md:grid-cols-2 gap-4">
      ${schemes.map((s) => {
        const have = s.required_documents.filter((d) => docs.has(docKey(s.id, d))).length;
        const total = s.required_documents.length;
        return html`<div key=${s.id} className="rounded-2xl border border-slate-200 dark:border-white/10 p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display font-bold">${t.scheme(s.id)}</h3>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">${t("docsReady", { have, total })}</span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
            <div className="h-full bg-leaf-500 transition-all duration-500" style=${{ width: `${(have / total) * 100}%` }}></div>
          </div>
          <ul className="mt-3 space-y-1.5">
            ${s.required_documents.map((d) => {
              const key = docKey(s.id, d);
              return html`<li key=${d}>
                <label className="flex items-center gap-3 cursor-pointer rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-white/5">
                  <input type="checkbox" checked=${docs.has(key)} onChange=${() => toggle(key)} className="w-5 h-5 accent-leaf-600" />
                  <span className=${docs.has(key) ? "line-through text-slate-400" : ""}>${d}</span>
                </label>
              </li>`;
            })}
          </ul>
        </div>`;
      })}
    </div>
  </section>`;
}
