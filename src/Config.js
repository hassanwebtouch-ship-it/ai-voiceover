/**
 * AI Caller: configuration.
 *
 * Secrets (API keys, IDs) live in Script Properties and are entered from the
 * "AI Caller" menu. Everything else lives on the "Settings" tab so it can be
 * changed without touching code.
 */

var SHEETS = {
  LEADS: 'Leads',
  CALLS: 'Calls',
  EMAILS: 'Emails',
  SETTINGS: 'Settings',
  DASHBOARD: 'Dashboard',
  LOG: 'Log'
};

var LEAD_HEADERS = [
  'Lead ID', 'Approved', 'Business Name', 'Contact Name', 'Phone', 'Email',
  'Website', 'Suburb', 'State', 'Category', 'Has GBP', 'GBP Rating',
  'GBP Reviews', 'Notes', 'Status', 'Attempts', 'Last Call At',
  'Next Attempt At', 'Last Call ID', 'Outcome', 'Interest Score', 'Summary',
  'Next Step', 'Callback Time', 'Services Interested', 'Recording',
  'Email Status', 'Last Email At', 'Updated At'
];

var CALL_HEADERS = [
  'Received At', 'Call ID', 'Lead ID', 'Business Name', 'Phone',
  'Ended Reason', 'Duration (s)', 'Cost (USD)', 'Outcome', 'Interest Score',
  'Decision Maker', 'Summary', 'Objections', 'Next Step', 'Callback Time',
  'Email Captured', 'Recording', 'Transcript File', 'Transcript'
];

var EMAIL_HEADERS = [
  'Processed At', 'Message ID', 'Thread ID', 'Lead ID', 'Direction', 'From',
  'To', 'Subject', 'Intent', 'Action', 'Summary', 'Body Preview'
];

var LOG_HEADERS = ['Time', 'Level', 'Where', 'Message', 'Details'];

var STATUS = {
  NEW: 'New',
  CALLING: 'Calling',
  RETRY: 'Retry',
  CALLBACK: 'Callback',
  INTERESTED: 'Interested',
  NOT_INTERESTED: 'Not Interested',
  DNC: 'Do Not Call',
  WRONG_NUMBER: 'Wrong Number',
  NO_ANSWER: 'No Answer',
  BAD_PHONE: 'Bad Phone',
  REVIEW: 'Needs Review'
};

/** Secrets kept in Script Properties. */
var SECRET_KEYS = {
  VAPI_API_KEY: 'VAPI_API_KEY',
  VAPI_PHONE_NUMBER_ID: 'VAPI_PHONE_NUMBER_ID',
  VAPI_ASSISTANT_ID: 'VAPI_ASSISTANT_ID',
  GEMINI_API_KEY: 'GEMINI_API_KEY',
  WEBHOOK_TOKEN: 'WEBHOOK_TOKEN',
  WEBAPP_URL: 'WEBAPP_URL',
  DRIVE_FOLDER_ID: 'DRIVE_FOLDER_ID',
  SPREADSHEET_ID: 'SPREADSHEET_ID',
  INBOX_SINCE: 'INBOX_SINCE'
};

/** [key, default value, help text]. Shown on the Settings tab. */
var DEFAULT_SETTINGS = [
  ['AGENCY_NAME', 'Webtouch', 'Your business name, as the AI says it on calls and in emails.'],
  ['AGENCY_WEBSITE', 'webtouch.com.au', 'Website the AI gives out if asked.'],
  ['AGENCY_PHONE', '', 'Phone number the AI gives out if asked who is calling. Australian telemarketing rules require you to give contact details on request.'],
  ['AGENT_NAME', 'Alex', 'Name the AI assistant uses on calls.'],
  ['CONSULTANT_NAME', '', 'Name of the person who takes booked meetings, e.g. "Sam". Blank = "one of our consultants".'],
  ['OFFER', 'a free 15-minute Google visibility check', 'What the AI tries to book.'],
  ['SERVICES', 'Local SEO and Google Business Profile setup and optimisation; Lead generation with Google Ads and Facebook ads; Website design and redesign; Getting more Google reviews', 'Services the AI can mention on calls and in emails. Separate with ;'],
  ['PRICING_NOTE', '', 'Optional, e.g. "Local SEO starts from $499 a month". Blank = the AI says the consultant quotes after the free check.'],
  ['BOOKING_LINK', '', 'Booking page link (Google Calendar appointment schedule, Calendly, etc.). Added to follow-up emails.'],
  ['NOTIFY_EMAIL', '', 'Where hot-lead alerts and the daily digest go. Blank = the Google account running this.'],
  ['EMAIL_SIGNATURE', 'Kind regards,\nThe Webtouch team\nwebtouch.com.au', 'Signature added to every email. Use \\n for new lines.'],
  ['BUSINESS_ADDRESS', '', 'Your business address and ABN for the email footer. The Spam Act requires commercial emails to identify the sender.'],
  ['CALL_DAYS', 'Mon,Tue,Wed,Thu,Fri', 'Days to call, in the lead\'s local time. The law allows Mon-Fri 9am-8pm and Sat 9am-5pm; Sundays and public holidays are always blocked.'],
  ['CALL_START', '09:30', 'Earliest call time (24h, lead\'s local time).'],
  ['CALL_END', '16:30', 'Latest call start time (24h, lead\'s local time).'],
  ['CALLS_PER_RUN', '2', 'Calls started each time the auto-caller runs (every 10 minutes).'],
  ['DAILY_CALL_LIMIT', '30', 'Maximum calls per day.'],
  ['MAX_ATTEMPTS', '3', 'Give up after this many unanswered attempts in a row.'],
  ['RETRY_AFTER_HOURS', '26', 'Wait this long before retrying an unanswered lead. 26 lands at a different time of day.'],
  ['AUTO_CALLBACKS', 'TRUE', 'TRUE = the AI calls back at the time a lead or receptionist asked for.'],
  ['AUTO_SEND_FOLLOWUPS', 'FALSE', 'TRUE = send post-call follow-up emails automatically. FALSE = save them as Gmail drafts for you to check.'],
  ['AUTO_SEND_REPLIES', 'FALSE', 'Same, for replies to leads who email back.'],
  ['HOT_SCORE', '70', 'Interest score (0-100) at or above which you get an instant alert.'],
  ['DEFAULT_STATE', 'NSW', 'Used for the time zone when a lead has no State.'],
  ['BLOCKED_DATES', '2026-12-25,2026-12-26,2026-12-28,2027-01-01,2027-01-26,2027-03-26,2027-03-27,2027-03-29,2027-04-26,2027-12-25,2027-12-27,2027-12-28', 'Dates (YYYY-MM-DD) never to call: national public holidays. Add state ones if you like.'],
  ['GEMINI_MODEL', 'gemini-2.5-flash', 'Google Gemini model used to score calls and write emails (free tier).'],
  ['VAPI_LLM_PROVIDER', 'openai', 'Model provider used by the voice agent inside Vapi.'],
  ['VAPI_LLM_MODEL', 'gpt-4o-mini', 'Model used by the voice agent inside Vapi.'],
  ['VAPI_VOICE_PROVIDER', 'vapi', 'Voice provider in Vapi, e.g. vapi or 11labs.'],
  ['VAPI_VOICE_ID', 'Elliot', 'Voice ID in Vapi. Pick one in the Vapi dashboard, then run "Create/update Vapi assistant".'],
  ['CHAT_WEBHOOK_URL', '', 'Optional Slack or Google Chat incoming-webhook URL for hot-lead alerts.']
];

var _settingsCache = null;

function getSettings_() {
  if (_settingsCache) return _settingsCache;
  var s = {};
  DEFAULT_SETTINGS.forEach(function (r) { s[r[0]] = r[1]; });
  var sh = ss_().getSheetByName(SHEETS.SETTINGS);
  if (sh && sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (r) {
      var key = String(r[0] || '').trim();
      if (key) s[key] = r[1];
    });
  }
  _settingsCache = s;
  return s;
}

function setting_(key) {
  var v = getSettings_()[key];
  return v === null || v === undefined ? '' : String(v).trim();
}

function settingNum_(key, fallback) {
  var n = Number(setting_(key));
  return isNaN(n) || setting_(key) === '' ? fallback : n;
}

function settingBool_(key) {
  return /^(true|yes|y|1|on)$/i.test(setting_(key));
}

function settingList_(key) {
  return setting_(key).split(/[,;\n]/).map(function (x) { return x.trim(); }).filter(String);
}

function getSecret_(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || '';
}

function setSecret_(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, String(value).trim());
}

function requireSecret_(key) {
  var v = getSecret_(key);
  if (!v) throw new Error(key + ' is not set. Use the AI Caller menu to finish setup.');
  return v;
}
