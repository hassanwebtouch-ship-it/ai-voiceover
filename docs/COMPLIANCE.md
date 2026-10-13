# Calling and emailing Australian businesses: what the rules mean for this system

This is a practical summary, not legal advice. Rules change, so check the ACMA website (https://www.acma.gov.au) before you scale up.

## Calls: Telemarketing and Research Calls Industry Standard

| Rule | How the system handles it |
|---|---|
| Call only Mon-Fri 9am-8pm and Sat 9am-5pm (the recipient's local time). No Sundays or national public holidays. | **Enforced in code** using each lead's State. Your Settings can only make the window narrower. National public holidays are on the Settings tab (`BLOCKED_DATES`). Add state holidays if you call one state heavily. |
| Say who you are, who you're calling for and why, at the start | The first line names the agent and your agency. The next line gives the reason. |
| Give contact details for your business if asked | The AI gives `AGENCY_NAME`, `AGENCY_WEBSITE` and `AGENCY_PHONE`. **Fill in `AGENCY_PHONE`.** |
| End the call when asked | The prompt makes the AI end the call immediately, and the lead becomes **Do Not Call**. |
| Don't hide your number (caller ID must be on) | Twilio and Telnyx numbers show caller ID by default. Don't turn it off. |

## Do Not Call Register

- Normal **business** numbers can't be placed on the Register, so most landlines of local businesses are fine to call.
- Numbers used **mainly for personal purposes** can be registered. Many tradies and sole traders use their personal mobile as the business number.
- **Wash your mobile numbers against the Register** before calling. You do this through the ACMA's Do Not Call Register washing service at https://www.donotcall.gov.au. Mark any registered numbers as *Do Not Call* in the sheet.

## Recording

Recording laws differ by state. Some need the other person's consent, and telling them at the start is the usual way to get it. The AI says **"this call is recorded"** in its very first sentence. Don't remove that line.

## Saying it's an AI

The AI says it is an AI assistant in the first sentence, and confirms it if asked. Pretending to be a person could count as misleading conduct under the Australian Consumer Law, and people react much worse when they find out later.

## Emails: Spam Act 2003

| Rule | How the system handles it |
|---|---|
| You need consent to send a commercial email | Post-call follow-ups are only created when the person **agreed on the call** to an email. Replies only go to people who emailed you first. The system does **not** send cold emails. |
| Identify the sender | Your signature and `BUSINESS_ADDRESS` (include your ABN) go on every email. |
| A working unsubscribe, honoured within 5 business days | Every email ends with *reply "unsubscribe"*. Replies like that are detected automatically and the lead is marked **Do Not Call** and **Unsubscribed**. |

## Privacy

Recordings and transcripts contain personal information. They're kept in your own Google Drive, not shared. Only share the folder with people who need it, and delete old recordings you no longer need, for example after 12 months.

## Good practice that keeps your number from being flagged as spam

- Keep volume modest at first (the defaults are 2 calls per run and 30 a day).
- Don't call the same business more than `MAX_ATTEMPTS` (3) times without an answer.
- Remove people quickly when asked. The system does this automatically.
