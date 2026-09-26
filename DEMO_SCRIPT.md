# 90-second demo — Sarkari Sahayak

Setup: `python server/main.py`, open http://localhost:8000 in Chrome, full screen. Clear site data first so the landing page shows.

| Time | On screen | Say |
|---|---|---|
| **0:00–0:10** | Landing page. The tagline cycles through Hindi, Tamil and English. | "Millions of Indians miss welfare they're entitled to because *they* have to find the schemes. Sarkari Sahayak flips that: from 1000+ schemes to *your* schemes." |
| **0:10–0:15** | Click **हिन्दी**. The whole UI switches to Hindi. | "The citizen picks a language, and the entire interface follows, not just the chat." |
| **0:15–0:35** | Click demo **🌾 रमेश · किसान**. His Hindi messages appear, and profile fields **pop in one by one** on the right. | "Ramesh, a farmer from UP, just talks. Sarvam's model extracts facts as he speaks, and his profile builds live. 'Dhai ekad' becomes 2.5 acres." |
| **0:35–0:45** | Results flip in. The benefit meter counts up to ₹6,000 cash + ₹5 lakh cover. Point at the **🛡️ Verified by rules engine** badge. | "The AI does not decide eligibility. A deterministic rules engine does, so the same facts always give the same answer." |
| **0:45–0:55** | On PM-KISAN click **नियम देखें**. The card flips to the cited clauses, footnoted [1] [2] [3]. Click **🔊 अपने नतीजे सुनें**. | "Every yes or no quotes the official clause, like a legal footnote. And he can *listen* to his results in Hindi via Bulbul." |
| **0:55–1:05** | Click **🛵 Arif**. Hinglish code-mixed input. PM-KISAN is ❌ with a *what-if* line. | "Arif writes Hinglish: '22k monthly' becomes ₹2.64 lakh a year. Where he's not eligible, we say exactly why." |
| **1:05–1:25** | Click **🎓 Kavya**. The UI switches to **Tamil**. Two cards turn amber ⚠️ **Conflict**. Scroll to the comparison card. | "Kavya, a student in Madurai, qualifies for *both* the state scholarship and the housing subsidy, but the rules allow only one per household. Most portals would just list both and let her application be rejected later." |
| **1:25–1:30** | Point at the side-by-side table, the quoted conflict rule and the **இதைத் தேர்ந்தெடு** buttons. End here. | "We show the rule, compare them side by side, and **she** chooses. AI that explains, rules that decide, and the citizen stays in control." |

**Backup lines if a judge asks:**
- *"What if the internet drops?"* Toggle Wi-Fi off. The personas are scripted and the rules engine is local, so everything still works. The header shows "Offline mode".
- *"Can it read documents?"* Scroll to the documents checklist → **Scan a document**. Aadhaar numbers are masked on the device before any AI sees them.
- *"Does it submit for me?"* Click **Prepare application**. Bulbul reads each field aloud for confirmation, and the only final action is Print/Download.
