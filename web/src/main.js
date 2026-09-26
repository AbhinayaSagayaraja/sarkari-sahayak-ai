// App shell and state orchestration.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { api, html, nextField, sleep, storage, store } from "./lib.js";
import { translator } from "./i18n.js";
import { stopSpeaking } from "./audio.js";
import { Footer, Header, Landing } from "./components/Chrome.js";
import { Chat } from "./components/Chat.js";
import { ProfileCard } from "./components/Profile.js";
import { Results } from "./components/Results.js";
import { Documents } from "./components/Documents.js";
import { Draft } from "./components/Draft.js";

let msgId = 0;
const bot = (key, extra = {}) => ({ id: ++msgId, role: "bot", key, ...extra });
const user = (text, extra = {}) => ({ id: ++msgId, role: "user", text, ...extra });
const opening = () => [bot("greeting"), bot("askHint")];

function App() {
  const [lang, setLangState] = useState(() => storage("ss-lang", null));
  const [theme, setTheme] = useState(() => storage("ss-theme", matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  const [boot, setBoot] = useState({ schemes: [], personas: [], sarvam: false });
  const [messages, setMessages] = useState(opening);
  const [profile, setProfile] = useState({});
  const [askedField, setAskedField] = useState(null);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [match, setMatch] = useState(null);
  const [matching, setMatching] = useState(false);
  const [chosen, setChosen] = useState({});
  const [docs, setDocs] = useState(new Set());
  const [draftFor, setDraftFor] = useState(null);
  const [session, setSession] = useState(0); // remounts the chat panel on reset

  const profileRef = useRef(profile);
  const runRef = useRef(0); // bumps on reset so in-flight persona scripts stop
  const t = useMemo(() => translator(lang || "en"), [lang]);

  useEffect(() => { api("bootstrap").then(setBoot).catch(() => {}); }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    store("ss-theme", theme);
  }, [theme]);
  useEffect(() => {
    if (!lang) return;
    document.documentElement.lang = lang;
    store("ss-lang", lang);
  }, [lang]);

  const setLang = (l) => { stopSpeaking(); setLangState(l); };
  const push = (...m) => setMessages((prev) => [...prev, ...m]);

  /** Apply extracted fields one at a time so they visibly pop into the profile card. */
  async function applyUpdates(updates, run) {
    for (const [k, v] of Object.entries(updates)) {
      if (run !== runRef.current) return;
      profileRef.current = { ...profileRef.current, [k]: v };
      setProfile(profileRef.current);
      await sleep(260);
    }
  }

  /** After each turn, ask for the next missing field or announce completion. */
  function followUp() {
    const nf = nextField(profileRef.current);
    setAskedField(nf);
    push(nf ? bot(`q.${nf}`) : bot("profileComplete"));
  }

  async function send(text, { voice = false } = {}) {
    const run = runRef.current;
    push(user(text, { voice }));
    setBusy(true);
    try {
      const res = await api("chat", { message: text, profile: profileRef.current, lang, asked_field: askedField });
      if (run !== runRef.current) return;
      if (res.intent === "question") {
        push(res.answer || res.citations?.length
          ? bot(null, { text: res.answer, citations: res.citations })
          : bot("notFound"));
      } else {
        setBusy(false);
        await applyUpdates(res.updates, run);
        if (run === runRef.current) followUp();
      }
    } catch {
      push(bot("errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    runRef.current++;
    setSession((n) => n + 1);
    stopSpeaking();
    profileRef.current = {};
    setProfile({});
    setMessages(opening());
    setAskedField(null);
    setMatch(null);
    setChosen({});
    setDocs(new Set());
    setDraftFor(null);
    setBusy(false);
    setPlaying(false);
  }

  /** Scripted demo: no live parsing, so the demo never depends on the network. */
  async function playPersona(p) {
    reset();
    const run = runRef.current;
    setLang(p.lang);
    setPlaying(true);
    for (const turn of p.script) {
      await sleep(700);
      if (run !== runRef.current) return;
      push(user(turn.text));
      setBusy(true);
      await sleep(900);
      setBusy(false);
      await applyUpdates(turn.updates, run);
      if (run !== runRef.current) return;
      followUp();
    }
    setPlaying(false);
  }

  const evaluate = useCallback(async () => {
    setMatching(true);
    try {
      const [res] = await Promise.all([api("match", { profile: profileRef.current }), sleep(match ? 0 : 900)]);
      setMatch(res);
    } catch { /* keep previous results */ }
    setMatching(false);
  }, [match]);

  // Run the rules engine automatically once the profile is complete, and again on every edit after that.
  useEffect(() => {
    if (!lang || (nextField(profile) !== null && !match)) return;
    const id = setTimeout(evaluate, 350);
    return () => clearTimeout(id);
  }, [profile]);

  const schemesById = Object.fromEntries(boot.schemes.map((s) => [s.id, s]));
  // Schemes whose documents we track: eligible ones, plus the chosen side of each conflict (both until chosen).
  const claimable = (match?.results || []).filter((r) => {
    if (r.status === "eligible") return true;
    if (r.status !== "conflict") return false;
    const c = match.conflicts.find((c) => c.schemes.includes(r.scheme_id));
    const pick = c && chosen[c.schemes.join("|")];
    return !pick || pick === r.scheme_id;
  }).map((r) => schemesById[r.scheme_id]).filter(Boolean);

  if (!lang) {
    return html`<${React.Fragment}>
      <${Landing} onPick=${setLang} />
      <${Footer} t=${translator("en")} />
    <//>`;
  }

  return html`<${React.Fragment}>
    <${Header} t=${t} lang=${lang} setLang=${setLang} theme=${theme}
      toggleTheme=${() => setTheme((x) => (x === "dark" ? "light" : "dark"))}
      sarvamLive=${boot.sarvam} onReset=${reset} />
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-5 pb-24 grid lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] gap-5 items-start">
      <div className="lg:sticky lg:top-20">
        <${Chat} key=${session} t=${t} lang=${lang} messages=${messages} busy=${busy} locked=${playing}
          onSend=${send} personas=${boot.personas} onPersona=${playPersona} sarvamLive=${boot.sarvam} />
      </div>
      <div className="space-y-5 min-w-0">
        <${ProfileCard} t=${t} profile=${profile} inferred=${match?.inferred} onFind=${evaluate} />
        <${Results} t=${t} lang=${lang} match=${match} loading=${matching} schemes=${boot.schemes} profile=${profile}
          chosen=${chosen} onChoose=${(pair, id) => setChosen((c) => ({ ...c, [pair]: id }))}
          onPrepare=${setDraftFor} sarvamLive=${boot.sarvam} />
        ${claimable.length > 0 && html`<${Documents} t=${t} lang=${lang} schemes=${claimable} profile=${profile}
          docs=${docs} setDocs=${setDocs} sarvamLive=${boot.sarvam} />`}
      </div>
    </main>
    ${draftFor && html`<${Draft} t=${t} lang=${lang} scheme=${schemesById[draftFor]}
      result=${match?.results.find((r) => r.scheme_id === draftFor)} profile=${profile} docs=${docs}
      onProfileChange=${(u) => { profileRef.current = { ...profileRef.current, ...u }; setProfile(profileRef.current); }}
      onClose=${() => setDraftFor(null)} sarvamLive=${boot.sarvam} />`}
    <${Footer} t=${t} />
  <//>`;
}

createRoot(document.getElementById("root")).render(html`<${App} />`);
