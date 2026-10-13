# AI Caller

AI phone calls to Australian local businesses, with call recording, lead scoring and email replies. It runs inside a Google Sheet, so there's no server and no automation subscription. The only paid part is the phone calls.

```
 Google Sheet (Leads)                      Vapi (voice agent)                 You
 ────────────────────                      ──────────────────                 ───
 Approved leads ──every 10 min──▶ start call ─▶ dials, talks, records
                                              │
 Calls tab, lead status,  ◀── end-of-call ────┘
 recording in Drive           webhook
        │
        ├─ Gemini scores the call (interested / callback / not interested / do-not-call)
        ├─ 🔥 instant email alert for hot leads ───────────────────────────▶ inbox
        ├─ follow-up email (Gmail draft, or auto-send) if they agreed to one
        └─ daily summary at 5pm ───────────────────────────────────────────▶ inbox

 Gmail ──every 15 min──▶ replies from leads are classified, answered (draft or auto),
                         unsubscribes honoured, hot replies alerted
```

## What it does

- **Calls** approved leads during legal calling hours in each lead's own state, with a daily cap, retries at different times, and callbacks at the time people ask for.
- **Opens with a specific reason** for each business: no Google Business Profile, few reviews, or no website, taken from your lead list.
- **Records** every call. The recording and transcript are saved to your Google Drive.
- **Scores** each call 0-100 and sorts it as Interested, Callback, Gatekeeper, Not Interested or Do Not Call. It also pulls out the decision maker's name, email and the agreed time.
- **Alerts you** by email (and optionally Slack or Google Chat) for interested leads and booked meetings.
- **Emails** a follow-up when someone agrees to one on the call, with your booking link.
- **Answers replies** from leads, as drafts by default. It marks unsubscribes and "not interested" automatically.
- **Stays within Australian rules**: AI and recording disclosure on every call, calling hours enforced in code, do-not-call honoured instantly, unsubscribe link on every email. See [docs/COMPLIANCE.md](docs/COMPLIANCE.md).

## What it costs

| Part | Tool | Cost |
|---|---|---|
| Lead list, CRM, automation | Google Sheets + Apps Script | Free |
| Recordings | Google Drive | Free (15 GB) |
| Emails | Gmail | Free |
| Call scoring, email writing | Google Gemini API | Free tier |
| Voice agent (speech, AI, voice, recording) | Vapi | Free starting credit, then roughly US$0.10-0.20/min all-in |
| Phone line | Twilio or Telnyx Australian number | Trial credit; then about A$5-10 a month per number plus a few cents per minute |

As a rough guide, 100 two-minute calls cost about US$20-40. Check current prices on each provider's site.

## Get started

Follow **[docs/SETUP.md](docs/SETUP.md)**. In short: create a Sheet, paste [`dist/AICaller.gs`](dist/AICaller.gs) into Apps Script, then work through the **AI Caller** menu.

The script the voice agent follows is in [docs/agent-prompt.md](docs/agent-prompt.md). It's built from the Settings tab, so you change it there.

## For developers

- Source is in `src/`, one file per area: `Caller` places calls, `Webhook` handles end-of-call reports, `Analysis` scores calls, `Email`, `Notify`, `Vapi`, `Gemini`, `Setup` (menu) and `Config` (settings).
- `npm test` runs the whole flow (calls, webhook, scoring, Drive, Gmail, inbox) against in-memory fakes of the Apps Script services.
- `npm run build` rebuilds `dist/AICaller.gs` and `docs/agent-prompt.md`. Run it after any change in `src/`.
- `clasp` users: copy `.clasp.json.example` to `.clasp.json`, add your script ID, then `clasp push`.
