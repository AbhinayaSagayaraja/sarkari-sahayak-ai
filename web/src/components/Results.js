// Match results: benefit meter, traffic-light scheme cards that flip to reveal the
// cited official clause, the conflict comparison, and a spoken summary.
import { useEffect, useRef, useState } from "react";
import { api, html, inr, leaves, showValue } from "../lib.js";
import { Icon } from "../icons.js";
import { translator } from "../i18n.js";
import { speak, stopSpeaking } from "../audio.js";
import { TrustBadge } from "./Chrome.js";

const STATUS_STYLE = {
  eligible: { icon: "check", pill: "bg-leaf-600 text-white", ring: "border-leaf-500/60", glow: "shadow-leaf-600/10", emoji: "✅" },
  not_eligible: { icon: "x", pill: "bg-rose-600 text-white", ring: "border-rose-400/50", glow: "shadow-rose-600/10", emoji: "❌" },
  conflict: { icon: "alert", pill: "bg-amber-500 text-white", ring: "border-amber-400/70", glow: "shadow-amber-500/20", emoji: "⚠️" },
  needs_info: { icon: "info", pill: "bg-slate-500 text-white", ring: "border-slate-300 dark:border-white/15", glow: "", emoji: "❔" },
};
const OUTCOME_STYLE = {
  pass: "text-leaf-600 dark:text-leaf-500",
  fail: "text-rose-600 dark:text-rose-400",
  missing: "text-slate-400",
};

function useCountUp(target, ms = 1200) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf, start;
    const step = (ts) => {
      start ??= ts;
      const p = Math.min(1, (ts - start) / ms);
      setV(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}

/** Deterministic "what would change this" hint for a failed criterion. */
function whatIf(t, c) {
  if (c.operator === "lte" && c.gap != null) {
    return c.field === "annual_income"
      ? t("overBy", { gap: inr(c.gap), limit: inr(c.value) })
      : t("requires", { field: t(`fields.${c.field}`), value: `≤ ${c.value}` });
  }
  if (c.operator === "gte" && c.gap != null) return t("underBy", { gap: c.gap, limit: c.value });
  const value = Array.isArray(c.value) ? c.value.map((v) => showValue(t, c.field, v)).join(" / ") : showValue(t, c.field, c.value);
  return t("requires", { field: t(`fields.${c.field}`), value });
}

/** Spoken summary, built from engine output only (never from free LLM text). */
export function buildSummary(t, match, profile) {
  const by = (s) => match.results.filter((r) => r.status === s).map((r) => t.scheme(r.scheme_id));
  const claimable = [...by("eligible"), ...by("conflict")];
  const parts = [t("sum.hello", { name: profile.name || "" })];
  parts.push(claimable.length ? t("sum.eligible", { n: claimable.length, list: claimable.join(", ") }) : t("sum.none"));
  for (const c of match.conflicts) parts.push(t("sum.conflict", { a: t.scheme(c.schemes[0]), b: t.scheme(c.schemes[1]) }));
  if (by("not_eligible").length) parts.push(t("sum.notElig", { list: by("not_eligible").join(", ") }));
  parts.push(t("sum.close"));
  return parts.join(" ");
}

function ListenButton({ t, lang, match, profile, sarvamLive }) {
  const [state, setState] = useState("idle"); // idle | loading | playing
  const [caption, setCaption] = useState("");
  useEffect(() => () => stopSpeaking(), []);

  async function play() {
    if (state !== "idle") { stopSpeaking(); setState("idle"); return; }
    setState("loading");
    // With Sarvam: English summary -> Sarvam Translate -> Bulbul. Offline: localised template -> browser voice.
    const text = sarvamLive ? buildSummary(translator("en"), match, profile) : buildSummary(t, match, profile);
    const playing = speak(text, lang, sarvamLive ? "en" : lang);
    setState("playing");
    setCaption(await playing);
    setState("idle");
  }

  return html`<div className="flex flex-col items-start gap-2">
    <button onClick=${play}
      className=${`inline-flex items-center gap-2 rounded-full px-4 py-2 font-semibold shadow-sm transition-colors ${state === "idle" ? "bg-ink-700 text-white hover:bg-ink-800" : "bg-rose-500 text-white"}`}>
      <${Icon} name=${state === "idle" ? "speaker" : "stop"} />
      ${state === "idle" ? `🔊 ${t("listen")}` : t("stop")}
      ${state === "playing" && html`<span className="flex items-end gap-0.5 h-4">${[0, 1, 2, 3].map((i) => html`<span key=${i} className="w-1 bg-white/90 rounded animate-pulse" style=${{ height: `${40 + i * 15}%`, animationDelay: `${i * 120}ms` }}></span>`)}</span>`}
    </button>
    ${caption && state === "idle" && html`<p className="rise text-sm text-slate-600 dark:text-slate-300 max-w-2xl italic">“${caption}”</p>`}
  </div>`;
}

function BenefitMeter({ t, summary, total }) {
  const cash = useCountUp(summary.cash_value_inr);
  const cover = useCountUp(summary.health_cover_inr);
  const count = summary.eligible_count + summary.conflict_count * 2;
  return html`<div className="slide-up rounded-3xl p-5 sm:p-6 bg-gradient-to-br from-ink-700 to-ink-900 text-white shadow-xl shadow-ink-900/20 relative overflow-hidden">
    <div className="absolute -right-10 -top-10 w-44 h-44 rounded-full bg-saffron-500/25 blur-2xl"></div>
    <div className="relative">
      <div className="text-sm font-semibold text-white/70">${t("meterTitle")}</div>
      <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div>
          <div className="font-display font-extrabold text-3xl sm:text-4xl tabular-nums">${inr(cash)}</div>
          <div className="text-sm text-white/70">${t("perYearCash")}</div>
        </div>
        <div>
          <div className="font-display font-extrabold text-3xl sm:text-4xl tabular-nums text-saffron-400">${inr(cover)}</div>
          <div className="text-sm text-white/70">${t("healthCover")}</div>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <div className="font-display font-extrabold text-3xl sm:text-4xl">${count}<span className="text-white/50 text-xl">/${total}</span></div>
          <div className="text-sm text-white/70">${t("schemesCount", { n: count, total })}</div>
        </div>
      </div>
    </div>
  </div>`;
}

function Citation({ n, c, t }) {
  return html`<blockquote className="citation mt-1.5 rounded-r-lg pl-3 pr-2 py-2 bg-saffron-50/60 dark:bg-saffron-500/[0.07] text-[13.5px] leading-snug text-slate-700 dark:text-slate-200">
    <sup className="font-bold text-saffron-700 dark:text-saffron-400 mr-1">[${n}]</sup>“${c.source_clause}”
    ${c.inferred && html`<div className="mt-1 text-xs italic text-slate-500 dark:text-slate-400">${t("inferredWhy", { reason: c.inferred })}</div>`}
  </blockquote>`;
}

function CriterionRow({ c, n, t }) {
  return html`<li className="py-2">
    <div className="flex items-start gap-2">
      <span className=${`mt-0.5 ${OUTCOME_STYLE[c.outcome]}`}><${Icon} name=${c.outcome === "pass" ? "check" : c.outcome === "fail" ? "x" : "info"} className="w-4 h-4" strokeWidth=${3} /></span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">
          ${t(`fields.${c.field}`)}
          <span className=${`ml-2 text-xs font-bold uppercase ${OUTCOME_STYLE[c.outcome]}`}>${t(`outcome.${c.outcome}`)}</span>
        </div>
        ${c.actual != null && html`<div className="text-xs text-slate-500 dark:text-slate-400">${t("yourValue", { value: showValue(t, c.field, c.actual) })}</div>`}
        <${Citation} n=${n} c=${c} t=${t} />
      </div>
    </div>
  </li>`;
}

function SchemeCard({ t, lang, scheme, result, profile, index, onPrepare }) {
  const [side, setSide] = useState("front");
  const [anim, setAnim] = useState("");
  const [explanation, setExplanation] = useState(null);
  const [explaining, setExplaining] = useState(false);
  const st = STATUS_STYLE[result.status];
  // What-if hints only for rules that actually failed (not the unused branch of a met "any of").
  const failed = leaves(result.criteria.filter((c) => c.outcome === "fail")).filter((c) => c.outcome === "fail");
  // Count top-level rules: an "any of" group is one rule, met if any branch is met.
  const passed = result.criteria.filter((c) => c.outcome === "pass").length;
  const claimable = result.status === "eligible" || result.status === "conflict";

  useEffect(() => setExplanation(null), [lang, result]);

  function flip() {
    setAnim("flip-out");
    setTimeout(() => { setSide((s) => (s === "front" ? "back" : "front")); setAnim("flip-in"); }, 200);
  }

  async function explain() {
    setExplaining(true);
    let text = null;
    try { text = (await api("explain", { scheme_id: scheme.id, profile, lang })).text; } catch { /* fall back below */ }
    // Offline fallback: a templated explanation from the engine output.
    text ??= [
      `${st.emoji} ${t(`status.${result.status}`)} — ${t.scheme(scheme.id)}.`,
      result.status === "not_eligible" ? failed.map((c) => whatIf(t, c)).join(" ") : "",
      result.status === "needs_info" ? t("missingInfo", { fields: result.missing_fields.map((f) => t(`fields.${f}`)).join(", ") }) : "",
      claimable ? t("allMet", { n: result.criteria.length }) : "",
    ].filter(Boolean).join(" ");
    setExplanation(text);
    setExplaining(false);
  }

  let footnote = 0;
  return html`<article className="flip-reveal" style=${{ animationDelay: `${index * 140}ms` }}>
    <div className=${`${anim} rounded-3xl border-2 ${st.ring} bg-white dark:bg-night-800 shadow-lg ${st.glow} p-4 sm:p-5 ${result.status === "conflict" ? "amber-pulse" : ""}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className=${`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-bold ${st.pill}`}>
          <${Icon} name=${st.icon} className="w-4 h-4" strokeWidth=${3} /> ${t(`status.${result.status}`)}
        </span>
        <span className="text-xs font-semibold rounded-full px-2 py-0.5 bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300">
          ${scheme.level === "central" ? t("central") : `${t("state")} · ${scheme.state}`}
        </span>
        <span className="ml-auto text-xs font-semibold text-slate-500 dark:text-slate-400">${t("rulesMet", { n: passed, total: result.criteria.length })}</span>
      </div>
      <h3 className="mt-3 font-display font-bold text-xl leading-tight">${t.scheme(scheme.id)}</h3>
      <div className="text-xs text-slate-500 dark:text-slate-400">${scheme.name}</div>

      ${side === "front"
        ? html`<div>
            <div className="mt-3 rounded-2xl bg-slate-50 dark:bg-white/5 p-3">
              <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 dark:text-slate-400">${t("benefit")}</div>
              <div className="font-semibold leading-snug">${scheme.benefit_amount_or_type}</div>
            </div>
            ${result.status === "conflict" && html`<div className="mt-3 text-sm font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
              <${Icon} name="alert" className="w-4 h-4" /> ${t("conflictsWith", { scheme: result.conflicts_with_active.map(t.scheme).join(", ") })}
            </div>`}
            ${result.status === "not_eligible" && failed.length > 0 && html`<div className="mt-3 text-sm text-rose-700 dark:text-rose-300">
              <span className="font-semibold">${t("whatIf")}:</span> ${whatIf(t, failed[0])}
            </div>`}
            ${result.status === "needs_info" && html`<div className="mt-3 text-sm text-slate-600 dark:text-slate-300">${t("missingInfo", { fields: result.missing_fields.map((f) => t(`fields.${f}`)).join(", ") })}</div>`}
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick=${flip} className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold border border-slate-300 dark:border-white/15 hover:border-saffron-500 hover:text-saffron-700 dark:hover:text-saffron-400">
                <${Icon} name="flip" className="w-4 h-4" /> ${t("showRule")}
              </button>
              ${claimable && html`<button onClick=${() => onPrepare(scheme.id)} className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold bg-saffron-500 text-white hover:bg-saffron-600">
                <${Icon} name="doc" className="w-4 h-4" /> ${t("prepare")}
              </button>`}
            </div>
          </div>`
        : html`<div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <h4 className="font-display font-bold">${t("whyTitle")}</h4>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">${t("officialText")}</span>
            </div>
            <ul className="divide-y divide-slate-100 dark:divide-white/5">
              ${result.criteria.map((c) => c.any_of
                ? html`<li key=${c.id} className="py-2">
                    <div className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400">${t("anyOf")}</div>
                    <ul className="pl-2 border-l-2 border-dashed border-slate-200 dark:border-white/10">
                      ${c.any_of.map((leaf) => html`<${CriterionRow} key=${leaf.id} c=${leaf} n=${++footnote} t=${t} />`)}
                    </ul>
                  </li>`
                : html`<${CriterionRow} key=${c.id} c=${c} n=${++footnote} t=${t} />`)}
            </ul>
            ${failed.length > 0 && html`<div className="mt-2 rounded-xl bg-rose-50 dark:bg-rose-500/10 p-3 text-sm">
              <div className="font-semibold text-rose-700 dark:text-rose-300">${t("whatIf")}</div>
              <ul className="list-disc pl-5 text-rose-800 dark:text-rose-200">${failed.map((c) => html`<li key=${c.id}>${whatIf(t, c)}</li>`)}</ul>
            </div>`}
            <div className="mt-3">
              ${explanation
                ? html`<p className="rise rounded-xl bg-ink-50 dark:bg-ink-500/15 p-3 text-sm leading-relaxed"><${Icon} name="sparkle" className="inline w-4 h-4 mr-1 text-ink-500" />${explanation}</p>`
                : explaining
                  ? html`<div className="space-y-2 p-1"><div className="skeleton h-3 w-full"></div><div className="skeleton h-3 w-4/5"></div></div>`
                  : html`<button onClick=${explain} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-700 dark:text-ink-100 hover:underline">
                      <${Icon} name="sparkle" className="w-4 h-4" /> ${t("explain")}
                    </button>`}
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-white/5 flex flex-wrap items-center gap-2 justify-between">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">${t("ruleSource")}: ${scheme.source_document}</span>
              <${TrustBadge} t=${t} compact />
            </div>
            <button onClick=${flip} className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold border border-slate-300 dark:border-white/15 hover:border-saffron-500">
              <${Icon} name="flip" className="w-4 h-4" /> ${t("back")}
            </button>
          </div>`}
    </div>
  </article>`;
}

function ConflictCard({ t, conflict, schemesById, chosen, onChoose }) {
  const [a, b] = conflict.schemes.map((id) => schemesById[id]);
  const higher = a.benefit_value_inr >= b.benefit_value_inr ? a.id : b.id;
  const rows = [
    ["benefit", (s) => s.benefit_amount_or_type],
    ["value", (s) => html`<span className="font-display font-bold text-lg">${inr(s.benefit_value_inr)}</span>
      ${s.id === higher && html`<span className="ml-1.5 text-[11px] font-bold rounded-full px-1.5 py-0.5 bg-leaf-50 text-leaf-700 dark:bg-leaf-600/20 dark:text-leaf-100">↑ ${t("higherValue")}</span>`}`],
    ["kind", (s) => t(`kind.${s.benefit_kind}`)],
    ["docs", (s) => html`<span><b>${s.required_documents.length}</b> · <span className="text-xs">${s.required_documents.join(", ")}</span></span>`],
    ["time", (s) => s.processing_time],
    ["where", (s) => s.apply_at],
  ];

  return html`<section className="slide-up amber-pulse rounded-3xl border-2 border-amber-400 bg-gradient-to-b from-amber-50 to-white dark:from-amber-500/10 dark:to-night-800 p-4 sm:p-6 shadow-xl shadow-amber-500/10">
    <div className="flex items-start gap-3">
      <div className="shrink-0 w-11 h-11 rounded-2xl bg-amber-500 text-white grid place-items-center text-2xl">⚖️</div>
      <div>
        <h3 className="font-display font-extrabold text-xl sm:text-2xl leading-tight text-amber-900 dark:text-amber-200">${t("conflictTitle")}</h3>
        <p className="text-slate-700 dark:text-slate-300">${t("conflictSub")}</p>
        ${conflict.already_availing && html`<p className="mt-1 font-semibold text-amber-800 dark:text-amber-200">${t("alreadyAvailing", { scheme: t.scheme(conflict.already_availing) })}</p>`}
      </div>
    </div>

    <blockquote className="citation mt-4 rounded-r-lg pl-3 pr-2 py-2 bg-white/70 dark:bg-white/5 text-sm">
      <span className="font-bold text-saffron-700 dark:text-saffron-400">${t("rule")}:</span> “${conflict.clause}”
    </blockquote>

    <div className="mt-4 rounded-2xl overflow-hidden border border-amber-200 dark:border-white/10 bg-white dark:bg-night-900/40">
      <div className="grid grid-cols-2 divide-x divide-amber-100 dark:divide-white/10 bg-amber-100/60 dark:bg-white/5">
        ${[a, b].map((s) => html`<div key=${s.id} className="p-3 font-display font-bold leading-tight">${t.scheme(s.id)}</div>`)}
      </div>
      ${rows.map(([key, render]) => html`
        <div key=${key} className="border-t border-amber-100 dark:border-white/10">
          <div className="px-3 pt-2 text-[11px] uppercase tracking-wide font-semibold text-slate-500 dark:text-slate-400">${t(`compare.${key}`)}</div>
          <div className="grid grid-cols-2 divide-x divide-amber-100 dark:divide-white/10 text-sm">
            ${[a, b].map((s) => html`<div key=${s.id} className="px-3 pb-2 pt-1">${render(s)}</div>`)}
          </div>
        </div>`)}
      <div className="grid grid-cols-2 gap-2 p-3 border-t border-amber-100 dark:border-white/10">
        ${[a, b].map((s) => html`
          <button key=${s.id} onClick=${() => onChoose(s.id)} aria-pressed=${chosen === s.id}
            className=${`rounded-full px-3 py-2.5 font-semibold transition-colors ${chosen === s.id ? "bg-leaf-600 text-white" : chosen ? "bg-slate-100 dark:bg-white/10 text-slate-500" : "bg-amber-500 text-white hover:bg-amber-600"}`}>
            ${chosen === s.id ? t("chosen") : t("choose")}
          </button>`)}
      </div>
    </div>
  </section>`;
}

function ResultsSkeleton() {
  return html`<div className="space-y-4" aria-busy="true">
    <div className="skeleton h-32 rounded-3xl"></div>
    <div className="grid md:grid-cols-2 gap-4">
      ${[0, 1, 2, 3].map((i) => html`<div key=${i} className="rounded-3xl border border-slate-200 dark:border-white/10 p-5 space-y-3">
        <div className="skeleton h-6 w-28 rounded-full"></div>
        <div className="skeleton h-6 w-3/4"></div>
        <div className="skeleton h-16 w-full"></div>
        <div className="skeleton h-9 w-40 rounded-full"></div>
      </div>`)}
    </div>
  </div>`;
}

export function Results({ t, lang, match, loading, schemes, profile, chosen, onChoose, onPrepare, sarvamLive }) {
  const ref = useRef(null);
  const schemesById = Object.fromEntries(schemes.map((s) => [s.id, s]));
  const hasMatch = Boolean(match);
  // Scroll the results into view once, when they first appear.
  useEffect(() => { if (hasMatch) ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [hasMatch]);

  if (loading && !match) return html`<${ResultsSkeleton} />`;
  if (!match) return null;
  const order = { conflict: 0, eligible: 1, needs_info: 2, not_eligible: 3 };
  const sorted = [...match.results].sort((x, y) => order[x.status] - order[y.status]);

  return html`<section ref=${ref} className="space-y-4 scroll-mt-20">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="font-display font-extrabold text-2xl sm:text-3xl">${t("resultsTitle")}</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 max-w-xl">${t("resultsSub")}</p>
      </div>
      <${TrustBadge} t=${t} />
    </div>
    <${BenefitMeter} t=${t} summary=${match.summary} total=${match.results.length} />
    <${ListenButton} t=${t} lang=${lang} match=${match} profile=${profile} sarvamLive=${sarvamLive} />
    <div className="grid md:grid-cols-2 gap-4">
      ${sorted.map((r, i) => html`<${SchemeCard} key=${r.scheme_id} t=${t} lang=${lang} scheme=${schemesById[r.scheme_id]}
        result=${r} profile=${profile} index=${i} onPrepare=${onPrepare} />`)}
    </div>
    ${match.conflicts.map((c) => html`<${ConflictCard} key=${c.schemes.join("|")} t=${t} conflict=${c}
      schemesById=${schemesById} chosen=${chosen[c.schemes.join("|")]} onChoose=${(id) => onChoose(c.schemes.join("|"), id)} />`)}
  </section>`;
}
