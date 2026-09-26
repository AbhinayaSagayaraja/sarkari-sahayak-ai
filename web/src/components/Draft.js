// Printable application draft. Sahayak reads each field aloud (Bulbul) and the
// citizen confirms or corrects it. Nothing is ever submitted — only printed/saved.
import { useEffect, useState } from "react";
import { html, showValue } from "../lib.js";
import { Icon } from "../icons.js";
import { speak, stopSpeaking, startRecording } from "../audio.js";
import { docKey } from "./Documents.js";

const YES = /^(yes|yeah|correct|right|haan|han|ha|sahi|हाँ|हां|सही|ஆம்|ஆமாம்|சரி|aama)/i;
const NO = /(no|nahi|galat|नहीं|गलत|இல்லை|தவறு|illa)/i;

const ENUMS = {
  gender: ["male", "female", "other"],
  occupation: ["farmer", "student", "gig_worker", "salaried", "self_employed", "unemployed", "homemaker", "other"],
  house_type: ["kutcha", "pucca", "none"],
};

/** Which profile fields go on this scheme's form. */
function formFields(schemeId) {
  const base = ["name", "age", "gender", "state", "occupation", "annual_income", "family_size", "house_type"];
  if (schemeId === "pm_kisan") base.push("owns_land", "land_acres");
  if (schemeId === "tn_postmatric_scholarship") base.push("enrolled_post_matric");
  return base;
}

function EditField({ t, field, value, onSave, onCancel }) {
  const [v, setV] = useState(value ?? "");
  const common = "rounded-lg border border-slate-300 dark:border-white/20 bg-white dark:bg-night-900 px-2 py-1";
  let control;
  if (ENUMS[field]) {
    control = html`<select value=${v} onChange=${(e) => setV(e.target.value)} className=${common}>
      ${ENUMS[field].map((o) => html`<option key=${o} value=${o}>${t(`values.${field}.${o}`)}</option>`)}
    </select>`;
  } else if (typeof value === "boolean") {
    control = html`<select value=${String(v)} onChange=${(e) => setV(e.target.value === "true")} className=${common}>
      <option value="true">${t("values.yes")}</option><option value="false">${t("values.no")}</option>
    </select>`;
  } else {
    control = html`<input value=${v} onChange=${(e) => setV(e.target.value)} className=${`${common} w-40`}
      inputMode=${typeof value === "number" ? "numeric" : "text"} autoFocus />`;
  }
  const parsed = () => (typeof value === "number" ? Number(String(v).replace(/[^\d.]/g, "")) : v);
  return html`<span className="inline-flex flex-wrap items-center gap-2">
    ${control}
    <button onClick=${() => onSave(parsed())} className="rounded-full px-3 py-1 text-sm font-semibold bg-leaf-600 text-white">${t("save")}</button>
    <button onClick=${onCancel} className="text-sm underline">${t("back")}</button>
  </span>`;
}

export function Draft({ t, lang, scheme, result, profile, docs, onProfileChange, onClose, sarvamLive }) {
  const fields = formFields(scheme.id).filter((f) => profile[f] !== undefined);
  const [confirmed, setConfirmed] = useState(new Set());
  const [editing, setEditing] = useState(null);
  const [guided, setGuided] = useState(null);   // index of field being read aloud
  const [listening, setListening] = useState(false);
  const stillEligible = result && (result.status === "eligible" || result.status === "conflict");

  useEffect(() => () => stopSpeaking(), []);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Read the current field aloud whenever the guided step changes.
  useEffect(() => {
    if (guided === null || guided >= fields.length) return;
    const f = fields[guided];
    speak(t("guidedPrompt", { field: t(`fields.${f}`), value: showValue(t, f, profile[f]) }), lang);
  }, [guided]);

  function confirm(f) {
    setConfirmed((s) => new Set([...s, f]));
    if (guided !== null) {
      const next = fields.findIndex((x, i) => i > guided && !confirmed.has(x));
      setGuided(next === -1 ? null : next);
    }
  }

  function save(f, value) {
    onProfileChange({ [f]: value });
    setEditing(null);
    confirm(f);
  }

  async function voiceAnswer(f) {
    setListening(true);
    try {
      stopSpeaking();
      const rec = await startRecording({ lang, useSarvam: sarvamLive });
      await new Promise((r) => setTimeout(r, 2500)); // short yes/no window
      const said = await rec.stop();
      if (YES.test(said.trim())) confirm(f);
      else if (NO.test(said)) setEditing(f);
    } catch { /* mic unavailable: the buttons still work */ }
    setListening(false);
  }

  const today = new Date().toLocaleDateString("en-IN");
  const required = scheme.required_documents;

  return html`<div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm overflow-y-auto" role="dialog" aria-modal="true" aria-label=${t("draftTitle")}>
    <div className="max-w-3xl mx-auto px-3 sm:px-6 py-6 pb-24">
      <div className="no-print flex flex-wrap items-center gap-2 mb-3">
        <button onClick=${() => setGuided(fields.findIndex((f) => !confirmed.has(f)))} disabled=${confirmed.size === fields.length}
          className="inline-flex items-center gap-2 rounded-full px-4 py-2 font-semibold bg-saffron-500 text-white hover:bg-saffron-600 disabled:opacity-50">
          <${Icon} name="speaker" /> ${t("guided")}
        </button>
        <span className="text-sm font-semibold text-white">${t("confirmedCount", { n: confirmed.size, total: fields.length })}</span>
        <button onClick=${onClose} className="ml-auto inline-flex items-center gap-1 rounded-full px-3 py-2 bg-white/90 text-slate-800 font-semibold">
          <${Icon} name="x" className="w-4 h-4" /> ${t("close")}
        </button>
      </div>

      <article className="print-area relative rounded-2xl bg-white text-slate-900 shadow-2xl p-5 sm:p-8 overflow-hidden">
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="font-display font-extrabold text-5xl sm:text-7xl text-rose-500/10 -rotate-[24deg] whitespace-nowrap select-none">${t("draftWatermark")}</span>
        </div>

        <header className="relative border-b-2 border-slate-900 pb-3">
          <div className="text-xs font-semibold uppercase tracking-widest text-rose-600">${t("draftWatermark")}</div>
          <h2 className="font-display font-extrabold text-2xl leading-tight mt-1">${t("draftTitle")}: ${scheme.name}</h2>
          <p className="text-sm text-slate-600 mt-1">${t("draftIntro")}</p>
        </header>

        ${!stillEligible && html`<div className="relative mt-3 rounded-lg bg-rose-50 text-rose-800 p-3 text-sm font-semibold flex gap-2">
          <${Icon} name="alert" className="w-5 h-5 shrink-0" /> ${t("ineligibleNow")}
        </div>`}

        <table className="relative w-full mt-4 text-sm">
          <tbody>
            ${fields.map((f, i) => html`<tr key=${f} className=${`border-b border-slate-200 ${guided === i ? "bg-saffron-50 outline outline-2 outline-saffron-400" : ""}`}>
              <th className="text-left font-semibold text-slate-600 py-2.5 pr-3 w-2/5 align-top">${t(`fields.${f}`)}</th>
              <td className="py-2.5 align-top">
                ${editing === f
                  ? html`<${EditField} t=${t} field=${f} value=${profile[f]} onSave=${(v) => save(f, v)} onCancel=${() => setEditing(null)} />`
                  : html`<div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-base">${showValue(t, f, profile[f])}</span>
                      ${confirmed.has(f)
                        ? html`<span className="inline-flex items-center gap-1 text-xs font-semibold text-leaf-700"><${Icon} name="check" className="w-3.5 h-3.5" strokeWidth=${3} /> ${t("confirmed")}</span>`
                        : html`<span className="no-print inline-flex gap-1.5">
                            <button onClick=${() => confirm(f)} className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-leaf-600 text-white">✓ ${t("correct")}</button>
                            <button onClick=${() => setEditing(f)} className="rounded-full px-2.5 py-0.5 text-xs font-semibold border border-slate-300 inline-flex items-center gap-1"><${Icon} name="pencil" className="w-3 h-3" /> ${t("edit")}</button>
                            ${guided === i && html`<button onClick=${() => voiceAnswer(f)} disabled=${listening}
                              className=${`rounded-full px-2.5 py-0.5 text-xs font-semibold inline-flex items-center gap-1 ${listening ? "bg-rose-500 text-white animate-pulse" : "bg-ink-700 text-white"}`}>
                              <${Icon} name="mic" className="w-3 h-3" /> ${t("sayYesNo")}</button>`}
                          </span>`}
                    </div>`}
              </td>
            </tr>`)}
            ${[t("aadhaarNo"), t("bankAcc")].map((label) => html`<tr key=${label} className="border-b border-slate-200">
              <th className="text-left font-semibold text-slate-600 py-2.5 pr-3">${label}</th>
              <td className="py-2.5"><span className="inline-block min-w-[12rem] border-b border-dashed border-slate-400 text-slate-400 italic">${t("fillYourself")}</span></td>
            </tr>`)}
          </tbody>
        </table>

        <section className="relative mt-5">
          <h3 className="font-display font-bold">${t("docsEnclosed")}</h3>
          <ul className="mt-1 grid sm:grid-cols-2 gap-x-4 text-sm">
            ${required.map((d) => {
              const ok = docs.has(docKey(scheme.id, d));
              return html`<li key=${d} className="flex items-center gap-2 py-0.5">
                <span className=${`w-4 h-4 rounded border grid place-items-center ${ok ? "bg-leaf-600 border-leaf-600 text-white" : "border-slate-400"}`}>${ok && html`<${Icon} name="check" className="w-3 h-3" strokeWidth=${3} />`}</span>
                <span>${d}</span>${!ok && html`<span className="text-xs text-rose-600">(${t("docsPending")})</span>`}
              </li>`;
            })}
          </ul>
        </section>

        <p className="relative mt-5 text-sm italic border-l-4 border-slate-300 pl-3">${t("declaration")}</p>
        <div className="relative mt-6 grid grid-cols-2 gap-6 text-sm">
          <div><div className="h-12 border-b border-slate-400"></div><div className="mt-1 text-slate-600">${t("signature")}</div></div>
          <div><div className="h-12 border-b border-slate-400 flex items-end">${today}</div><div className="mt-1 text-slate-600">${t("date")}</div></div>
        </div>
        <p className="relative mt-5 text-[11px] text-slate-500">${t("disclaimer")} · ${scheme.apply_at}</p>
      </article>

      <div className="no-print mt-4 flex justify-center">
        <button onClick=${() => window.print()} className="inline-flex items-center gap-2 rounded-full px-5 py-3 font-semibold bg-ink-700 text-white shadow-lg hover:bg-ink-800 text-center">
          <${Icon} name="print" /> ${t("download")}
        </button>
      </div>
    </div>
  </div>`;
}
