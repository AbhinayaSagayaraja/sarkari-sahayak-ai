// Landing page, header, trust badge and the persistent disclaimer footer.
import { useEffect, useState } from "react";
import { html } from "../lib.js";
import { Icon } from "../icons.js";
import { LANGS, translator } from "../i18n.js";

export function Logo({ size = "w-10 h-10" }) {
  return html`<div className=${`${size} shrink-0 rounded-2xl bg-gradient-to-br from-saffron-400 to-saffron-600 grid place-items-center shadow-md shadow-saffron-500/30`}>
    <span className="font-display font-bold text-white text-xl leading-none translate-y-[1px]">स</span>
  </div>`;
}

export function TrustBadge({ t, compact = false }) {
  return html`<span className=${`inline-flex items-center gap-1.5 rounded-full border border-leaf-600/30 bg-leaf-50 text-leaf-700 dark:bg-leaf-600/15 dark:text-leaf-100 dark:border-leaf-500/30 font-semibold ${compact ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm"}`}>
    <${Icon} name="shield" className=${compact ? "w-3.5 h-3.5" : "w-4 h-4"} />
    ${t("trust")}
  </span>`;
}

export function Landing({ onPick }) {
  // Cycle the tagline through all three languages before the citizen has picked one.
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % LANGS.length), 2600);
    return () => clearInterval(id);
  }, []);
  const tl = translator(LANGS[i].code);
  const en = translator("en");

  return html`<main className="tricolour-bg min-h-screen flex flex-col">
    <div className="max-w-5xl w-full mx-auto px-4 sm:px-6 pt-8 sm:pt-14 pb-28 flex-1 flex flex-col">
      <div className="flex items-center gap-3">
        <${Logo} />
        <div>
          <div className="font-display font-bold text-xl leading-tight">Sarkari Sahayak</div>
          <div className="text-sm text-slate-500 dark:text-slate-400">सरकारी सहायक · சர்க்காரி சஹாயக்</div>
        </div>
      </div>

      <h1 key=${i} className="rise font-display font-extrabold text-4xl sm:text-6xl leading-[1.08] mt-10 sm:mt-16 max-w-3xl text-ink-800 dark:text-white min-h-[2.3em]">
        ${tl("tagline")}
      </h1>
      <p className="mt-4 text-lg sm:text-xl text-slate-600 dark:text-slate-300 max-w-2xl">${en("landingSub")}</p>

      <h2 className="mt-10 font-display font-semibold text-lg text-slate-700 dark:text-slate-200">
        ${LANGS.map((l) => translator(l.code)("chooseLang")).join(" · ")}
      </h2>
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
        ${LANGS.map((l, idx) => html`
          <button key=${l.code} onClick=${() => onPick(l.code)}
            className="rise group text-left rounded-3xl p-5 sm:p-6 bg-white/80 dark:bg-night-800/80 backdrop-blur border-2 border-transparent hover:border-saffron-500 focus-visible:border-saffron-500 outline-none shadow-lg shadow-slate-900/5 transition-all hover:-translate-y-1"
            style=${{ animationDelay: `${idx * 90}ms` }}>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-saffron-50 dark:bg-saffron-500/15 grid place-items-center font-display font-bold text-4xl text-saffron-600 group-hover:bg-saffron-500 group-hover:text-white transition-colors">${l.glyph}</div>
              <div>
                <div className="font-display font-bold text-2xl sm:text-3xl">${l.native}</div>
                <div className="text-slate-500 dark:text-slate-400 text-sm">${l.english}</div>
              </div>
            </div>
            <div className="mt-4 text-saffron-700 dark:text-saffron-400 font-semibold flex items-center gap-1">
              ${translator(l.code)("continueIn")} <span className="transition-transform group-hover:translate-x-1">→</span>
            </div>
          </button>`)}
      </div>

      <ul className="mt-10 grid sm:grid-cols-3 gap-3 text-slate-700 dark:text-slate-300">
        ${[["mic", 0], ["shield", 1], ["user", 2]].map(([icon, k]) => html`
          <li key=${icon} className="flex items-center gap-3 rounded-2xl bg-white/60 dark:bg-white/5 px-4 py-3">
            <span className="text-leaf-600 dark:text-leaf-500"><${Icon} name=${icon} /></span>
            <span className="font-medium">${en("props")[k]}</span>
          </li>`)}
      </ul>
      <p className="mt-8 text-xs text-slate-500 dark:text-slate-400">Powered by Sarvam AI — Saaras (speech), Bulbul (voice), Sarvam Translate, Sarvam Vision (documents).</p>
    </div>
  </main>`;
}

export function Header({ t, lang, setLang, theme, toggleTheme, sarvamLive, onReset }) {
  return html`<header className="sticky top-0 z-30 bg-paper/85 dark:bg-night-900/85 backdrop-blur border-b border-slate-200/70 dark:border-white/10">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
      <${Logo} size="w-9 h-9" />
      <div className="min-w-0">
        <div className="font-display font-bold text-lg leading-tight truncate">${t("appName")}</div>
        <div className="hidden sm:block text-xs text-slate-500 dark:text-slate-400 truncate">${t("tagline")}</div>
      </div>
      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <span title=${sarvamLive ? t("live") : t("offline")}
          className=${`hidden md:inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-1 ${sarvamLive ? "bg-leaf-50 text-leaf-700 dark:bg-leaf-600/15 dark:text-leaf-100" : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300"}`}>
          <span className=${`w-2 h-2 rounded-full ${sarvamLive ? "bg-leaf-500 animate-pulse" : "bg-slate-400"}`}></span>
          ${sarvamLive ? t("live") : t("offline")}
        </span>
        <div role="group" aria-label="Language" className="flex rounded-full bg-slate-100 dark:bg-white/10 p-0.5">
          ${LANGS.map((l) => html`
            <button key=${l.code} onClick=${() => setLang(l.code)} aria-pressed=${lang === l.code}
              className=${`px-2.5 sm:px-3 py-1 rounded-full text-sm font-semibold transition-colors ${lang === l.code ? "bg-white dark:bg-night-800 text-saffron-700 dark:text-saffron-400 shadow" : "text-slate-600 dark:text-slate-300"}`}>
              ${l.native}
            </button>`)}
        </div>
        <button onClick=${toggleTheme} title=${t("theme")} aria-label=${t("theme")}
          className="w-9 h-9 grid place-items-center rounded-full hover:bg-slate-100 dark:hover:bg-white/10">
          <${Icon} name=${theme === "dark" ? "sun" : "moon"} />
        </button>
        <button onClick=${onReset} title=${t("startOver")} aria-label=${t("startOver")}
          className="w-9 h-9 grid place-items-center rounded-full hover:bg-slate-100 dark:hover:bg-white/10">
          <${Icon} name="reset" />
        </button>
      </div>
    </div>
  </header>`;
}

export function Footer({ t }) {
  return html`<footer className="no-print fixed bottom-0 inset-x-0 z-40 bg-ink-800 text-white/95 dark:bg-black/80 backdrop-blur">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-center gap-2 text-xs sm:text-sm">
      <${Icon} name="scale" className="w-4 h-4 shrink-0 text-saffron-400" />
      <span>${t("disclaimer")}</span>
    </div>
  </footer>`;
}
