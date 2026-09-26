// Live profile card: each extracted field pops in the moment it's known.
import { html, PROFILE_FIELDS, showValue, nextField } from "../lib.js";
import { Icon } from "../icons.js";

const CORE = ["name", "age", "state", "occupation", "annual_income", "family_size", "house_type"];

function ProgressRing({ value }) {
  const r = 16, c = 2 * Math.PI * r;
  return html`<svg viewBox="0 0 40 40" className="w-11 h-11 -rotate-90" aria-hidden="true">
    <circle cx="20" cy="20" r=${r} fill="none" stroke="currentColor" strokeWidth="4" className="text-slate-200 dark:text-white/10" />
    <circle cx="20" cy="20" r=${r} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"
      className="text-saffron-500 transition-all duration-700" strokeDasharray=${c} strokeDashoffset=${c * (1 - value)} />
  </svg>`;
}

export function ProfileCard({ t, profile, inferred, onFind }) {
  const known = PROFILE_FIELDS.filter((f) => profile[f] !== undefined);
  const guessed = PROFILE_FIELDS.filter((f) => profile[f] === undefined && inferred?.[f]);
  const progress = CORE.filter((f) => profile[f] !== undefined).length / CORE.length;
  const ready = nextField(profile) === null;

  return html`<section className="rounded-3xl bg-white dark:bg-night-800 border border-slate-200/70 dark:border-white/10 p-4 sm:p-5 shadow-sm">
    <div className="flex items-center gap-3">
      <div className="relative">
        <${ProgressRing} value=${progress} />
        <span className="absolute inset-0 grid place-items-center text-[11px] font-bold">${Math.round(progress * 100)}%</span>
      </div>
      <div className="min-w-0">
        <h2 className="font-display font-bold text-lg leading-tight">${t("profileTitle")}</h2>
        ${profile.name && html`<div className="pop-in text-sm text-slate-500 dark:text-slate-400 truncate">${profile.name}</div>`}
      </div>
      ${!ready && known.length > 3 && html`
        <button onClick=${onFind} className="ml-auto text-sm font-semibold rounded-full px-3 py-1.5 bg-ink-700 text-white hover:bg-ink-800">${t("findSchemes")}</button>`}
    </div>

    ${known.length === 0
      ? html`<div className="mt-4 grid grid-cols-2 gap-2">
          ${[0, 1, 2, 3].map((i) => html`<div key=${i} className="rounded-xl border border-dashed border-slate-300 dark:border-white/15 p-3">
            <div className="skeleton h-2.5 w-1/2 mb-2 !animate-none"></div><div className="skeleton h-3.5 w-3/4 !animate-none"></div>
          </div>`)}
          <p className="col-span-2 text-sm text-slate-500 dark:text-slate-400 mt-1">${t("profileEmpty")}</p>
        </div>`
      : html`<dl className="mt-4 grid grid-cols-2 gap-2">
          ${known.map((f) => html`
            <div key=${f} className="pop-in glow-once rounded-xl bg-saffron-50/70 dark:bg-saffron-500/10 border border-saffron-200/70 dark:border-saffron-500/20 px-3 py-2">
              <dt className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 dark:text-slate-400">${t(`fields.${f}`)}</dt>
              <dd className="font-semibold truncate" title=${showValue(t, f, profile[f])}>${showValue(t, f, profile[f])}</dd>
            </div>`)}
          ${guessed.map((f) => html`
            <div key=${`inf-${f}`} className="pop-in rounded-xl border border-dashed border-slate-300 dark:border-white/20 px-3 py-2" title=${t("inferredWhy", { reason: inferred[f].reason })}>
              <dt className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                ${t(`fields.${f}`)} <${Icon} name="info" className="w-3 h-3" />
              </dt>
              <dd className="font-medium italic text-slate-600 dark:text-slate-300">${showValue(t, f, inferred[f].value)} <span className="text-[11px] not-italic opacity-70">· ${t("inferred")}</span></dd>
            </div>`)}
        </dl>`}
  </section>`;
}
