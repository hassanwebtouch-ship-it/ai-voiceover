# Setup guide

About 45 minutes the first time. You need a computer and your phone.

## Part A: accounts

| # | What | Where | Cost |
|---|------|-------|------|
| 1 | **Google account** that will run everything (Sheet, Gmail, Drive). Use the agency mailbox you want follow-ups sent from. | You already have it | Free |
| 2 | **Gemini API key** (scores calls, writes emails) | https://aistudio.google.com/apikey → *Create API key* | Free tier |
| 3 | **Vapi account** (the voice agent: talks, listens, records) | https://dashboard.vapi.ai → sign up. Then *API Keys* → copy the **Private** key | Free starting credit, then pay per minute |
| 4 | **A phone number to call from** | See below | Trial credit, then about A$5-10 a month |

### The phone number

Vapi's own free numbers are US numbers meant for testing, and they usually can't call Australia. You need your own number connected to Vapi:

1. Sign up at https://www.twilio.com. The trial comes with some free credit.
2. **For testing:** on a trial account Twilio only calls numbers you have verified. Add your own mobile under *Phone Numbers → Verified Caller IDs*. Trial calls start with a short Twilio message; that's normal.
3. **For real calls:** upgrade the account (add a card), then buy an **Australian** number under *Phone Numbers → Buy a number → Australia*. Australian numbers need a short regulatory form (business name, ABN, Australian address). Approval can take one to a few days, so start this early. A local landline number (02/03/07/08) usually costs less than a mobile number.
4. In Vapi: *Phone Numbers → Import → Twilio*. Paste your Twilio **Account SID**, **Auth Token** (Twilio console home page) and the number.

Local businesses are much more likely to answer an Australian number than an overseas one. Telnyx (https://telnyx.com) is a cheaper alternative to Twilio and is imported into Vapi the same way.

## Part B: install the system (in Google Sheets)

1. Create a new Google Sheet. Name it **AI Caller CRM**.
2. **Extensions → Apps Script.** Delete everything in `Code.gs`, then paste the whole of [`dist/AICaller.gs`](../dist/AICaller.gs). Click **Save** (💾).
3. Optional but recommended: ⚙️ **Project Settings** → time zone **(GMT+10:00) Sydney**.
4. Go back to the Sheet and reload the page. After a few seconds an **AI Caller** menu appears.
5. **AI Caller → 1. Set up sheets.** Google asks you to authorise the script:
   *Review permissions → choose your account → "Google hasn't verified this app" → Advanced → Go to AI Caller (unsafe) → Allow.*
   This warning is normal for any script you wrote yourself. The script only runs in your own account.
6. Open the **Settings** tab and fill in at least:
   - `AGENCY_NAME`, `AGENCY_WEBSITE`, `AGENCY_PHONE` (a number people can call back on; the law requires you to give one if asked)
   - `CONSULTANT_NAME`: who takes the booked calls
   - `BOOKING_LINK`: your booking page link. A Google Calendar *appointment schedule* or Calendly free plan both work.
   - `EMAIL_SIGNATURE`, `BUSINESS_ADDRESS` (include your ABN; the Spam Act requires it)
   - `PRICING_NOTE` if you want the AI to quote a starting price
7. **AI Caller → 2. Enter API keys.** Paste the Vapi private key, then the Gemini key. They are saved in the script's hidden properties, not in the sheet.
8. **AI Caller → 3. Choose Vapi phone number.**
9. Publish the webhook that Vapi sends call results to. In the Apps Script editor:
   **Deploy → New deployment → ⚙️ Select type → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**

   Click **Deploy** and copy the **Web app URL** (it ends in `/exec`).
10. **AI Caller → 4. Save web app URL**, then paste it.
11. **AI Caller → 5. Create/update Vapi assistant.** This creates the voice agent in your Vapi account with the script from [`agent-prompt.md`](agent-prompt.md).
12. **AI Caller → Check setup.** Every line should show ✅.
13. **AI Caller → Test Gemini with a sample call.** You should see a scored example.

## Part C: test on your own phone

1. On the **Leads** tab, row 2 is a TEST lead. Put **your own mobile** in *Phone* and tick **Approved**.
   Change its *Email* to a **different** address you can read, such as a personal Gmail. Emails from the account running the script are ignored.
2. Click any cell in that row → **AI Caller → Call the selected lead now**.
3. Answer and play the part of a busy plumber. Try a few things: say you're interested, ask the price, ask "are you a robot?", give your email and agree to a time.
4. About a minute after you hang up:
   - **Calls** tab: outcome, score, summary and transcript
   - **Leads** tab: status, next step, and a link to the recording (saved in Drive under *AI Caller - Call Recordings*)
   - Your inbox: a 🔥 hot-lead alert
   - Gmail **Drafts**: a follow-up email to the address you gave
5. Send that draft, reply to it from the test address, then **AI Caller → Check inbox now**. A reply draft appears in the thread and the **Emails** tab logs it.
6. Test the "no" path too: call again and say *"don't call me again"*. The lead should become **Do Not Call** with Approved unticked.

If something doesn't work, look at the **Log** tab. Most problems show up there with a clear message.

## Part D: go live

1. Add leads to the **Leads** tab: paste rows from any spreadsheet, keeping the same column order. [`leads-template.csv`](leads-template.csv) has the columns in order with two example rows. Leave *Lead ID*, *Status* and everything after *Notes* blank; the system fills those in.
   - Needed: **Business Name**, **Phone**, **State** (sets the time zone for calling hours)
   - Strongly recommended: **Category**, **Suburb**, **Has GBP** (Yes/No), **GBP Rating**, **GBP Reviews**, **Website**. The AI uses these to open the call with a specific reason, which works much better than a generic pitch.
   - Phone numbers can be typed any normal way (`0412 345 678`, `(02) 9876 5432`). 13/1300/1800 numbers can't be called and are marked *Bad Phone*.
2. Read [`COMPLIANCE.md`](COMPLIANCE.md) and wash any mobile numbers against the Do Not Call Register.
3. Tick **Approved** on the leads you want called. Nothing is ever called without that tick.
4. **AI Caller → ▶ Start automation.** From then on, every 10 minutes it:
   - calls up to `CALLS_PER_RUN` approved leads, only during your calling hours in each lead's own state, up to `DAILY_CALL_LIMIT` a day
   - retries unanswered numbers up to `MAX_ATTEMPTS` times, at a different time of day
   - calls back at the time a lead or receptionist asked for (`AUTO_CALLBACKS`)
   - checks Gmail for replies from leads and drafts answers (every 15 minutes)

   At 5pm Sydney time you get a daily summary email.
5. **⏸ Stop automation** turns it all off at once.

Start with `CALLS_PER_RUN` 1 and `DAILY_CALL_LIMIT` 10 for the first few days. Listen to some recordings, improve the Settings, and run *5. Create/update Vapi assistant* after each change.

## Lead statuses

| Status | Meaning | Will it be called? |
|---|---|---|
| New | Not called yet | Yes, if Approved |
| Calling | Call in progress | No |
| Retry | No answer, voicemail or receptionist; tries again later | Yes, when *Next Attempt At* passes |
| Callback | Asked us to call back at a time | Yes, at that time (if `AUTO_CALLBACKS` is TRUE) |
| Interested | Agreed to a check or wants to hear more | No. **This one is yours.** |
| Not Interested | Said no | No |
| Do Not Call | Asked not to be called or emailed | Never |
| No Answer | Gave up after `MAX_ATTEMPTS` | No |
| Wrong Number / Bad Phone | Number problem | No |
| Needs Review | Someone answered but automatic scoring failed. Listen to the recording and set the status yourself. | No |

To call a lead again, set its Status back to **New** and tick Approved.

## Free-account limits worth knowing

A free Gmail account lets Apps Script triggers run for about 90 minutes a day in total, and send about 100 emails a day. This system normally uses a fraction of that: it skips overnight runs, and each run takes seconds. If you hit the limit, the **Log** tab shows quota errors. A Google Workspace account (e.g. your @webtouch.com.au mailbox, if it's on Workspace) gets much higher limits.

## Updating the code later

Paste the new `dist/AICaller.gs` over the old one, then **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. The web app URL stays the same.

## Turning on auto-send

Follow-ups and replies are saved as **drafts** until you set `AUTO_SEND_FOLLOWUPS` / `AUTO_SEND_REPLIES` to `TRUE`. Leave them as drafts for the first couple of weeks and read what the AI writes. Even with auto-send on, a reply that needs a person (exact prices, complaints, a proposed meeting time) stays a draft and you get an alert.
