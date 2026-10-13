/**
 * AI Caller: outbound AI calls + call recording + lead scoring + email replies,
 * running free inside Google Sheets. Generated from src/ by tools/bundle.js; edit src/, not this file.
 * Setup guide: docs/SETUP.md
 */

// ===== Config =====

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

// ===== Util =====

/**
 * AI Caller: small helpers (phone numbers, time zones, HTTP, text).
 */

var STATE_TZ = {
  NSW: 'Australia/Sydney',
  ACT: 'Australia/Sydney',
  VIC: 'Australia/Melbourne',
  TAS: 'Australia/Hobart',
  QLD: 'Australia/Brisbane',
  SA: 'Australia/Adelaide',
  NT: 'Australia/Darwin',
  WA: 'Australia/Perth'
};

var STATE_NAMES = {
  'NEW SOUTH WALES': 'NSW', 'AUSTRALIAN CAPITAL TERRITORY': 'ACT', 'VICTORIA': 'VIC',
  'TASMANIA': 'TAS', 'QUEENSLAND': 'QLD', 'SOUTH AUSTRALIA': 'SA',
  'NORTHERN TERRITORY': 'NT', 'WESTERN AUSTRALIA': 'WA'
};

var HOME_TZ = 'Australia/Sydney';

function normaliseState_(raw) {
  var s = String(raw || '').trim().toUpperCase();
  if (STATE_TZ[s]) return s;
  return STATE_NAMES[s] || '';
}

function tzForState_(state, defaultState) {
  return STATE_TZ[normaliseState_(state)] || STATE_TZ[normaliseState_(defaultState)] || HOME_TZ;
}

/**
 * Turns Australian phone numbers as people type them into E.164 (+61...).
 * Handles numbers Google Sheets stripped the leading 0 from.
 * Numbers that already start with + are kept as they are (handy for testing
 * with your own overseas phone). Returns '' when the number can't be dialled.
 */
function normaliseAuPhone_(raw) {
  if (raw === null || raw === undefined) return '';
  var s = String(raw).trim();
  if (!s) return '';
  var d = s.replace(/\D/g, '');
  if (!d) return '';
  if (s.charAt(0) === '+' || d.indexOf('0011') === 0) {
    if (d.indexOf('0011') === 0) d = d.slice(4);
    if (d.indexOf('610') === 0 && d.length === 12) d = '61' + d.slice(3);
    return d.length >= 8 && d.length <= 15 ? '+' + d : '';
  }
  if (d.indexOf('61') === 0 && d.length === 11) return '+' + d;
  if (d.charAt(0) === '0' && d.length === 10 && /^0[23478]/.test(d)) return '+61' + d.slice(1);
  if (d.length === 9 && /^[23478]/.test(d)) return '+61' + d;
  return ''; // 13 / 1300 / 1800 numbers and anything else we can't call
}

function fmt_(date, tz, pattern) {
  return Utilities.formatDate(date, tz, pattern);
}

/**
 * True when it is OK to call someone in time zone `tz` at `date`.
 * Hard limits from the Telemarketing Industry Standard are always applied
 * (weekdays 9am-8pm, Saturday 9am-5pm, never Sunday); `opts` can only narrow them.
 */
function isWithinCallWindow_(date, tz, opts) {
  var day = fmt_(date, tz, 'EEE');
  var hm = fmt_(date, tz, 'HH:mm');
  var ymd = fmt_(date, tz, 'yyyy-MM-dd');
  if (day === 'Sun') return false;
  if (hm < '09:00' || hm >= '20:00') return false;
  if (day === 'Sat' && hm >= '17:00') return false;
  if ((opts.blocked || []).indexOf(ymd) >= 0) return false;
  if (opts.days && opts.days.length && opts.days.indexOf(day) < 0) return false;
  if (opts.start && hm < opts.start) return false;
  if (opts.end && hm >= opts.end) return false;
  return true;
}

/** "2026-10-15 14:30" in time zone tz -> Date. Returns null if unparseable. */
function localToDate_(str, tz) {
  var m = String(str || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/);
  if (!m) return null;
  var asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  // Offset of tz around that moment, e.g. "+1100".
  var off = fmt_(new Date(asUtc), tz, 'Z');
  var om = off.match(/^([+-])(\d{2})(\d{2})$/);
  if (!om) return null;
  var mins = (+om[2] * 60 + +om[3]) * (om[1] === '-' ? -1 : 1);
  var guess = new Date(asUtc - mins * 60000);
  // Re-check once in case the guess crossed a daylight-saving change.
  var off2 = fmt_(guess, tz, 'Z');
  if (off2 !== off) {
    var om2 = off2.match(/^([+-])(\d{2})(\d{2})$/);
    var mins2 = (+om2[2] * 60 + +om2[3]) * (om2[1] === '-' ? -1 : 1);
    guess = new Date(asUtc - mins2 * 60000);
  }
  return guess;
}

function toBool_(v) {
  if (v === true) return true;
  return /^(true|yes|y|1|x|✓)$/i.test(String(v || '').trim());
}

/** Yes / No / '' (unknown) from whatever was typed in a sheet. */
function yesNo_(v) {
  var s = String(v === null || v === undefined ? '' : v).trim().toLowerCase();
  if (v === true || /^(yes|y|true|1|has|found)$/.test(s)) return 'Yes';
  if (v === false || /^(no|n|false|0|none|not found)$/.test(s)) return 'No';
  return '';
}

/** Safe nested lookup: dig_(obj, 'a.b.0.c'). */
function dig_(obj, path) {
  var parts = path.split('.');
  var cur = obj;
  for (var i = 0; i < parts.length; i++) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[parts[i]];
  }
  return cur;
}

function truncate_(s, n) {
  s = String(s || '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function extractEmail_(s) {
  var m = String(s || '').match(/[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  return m ? m[0].toLowerCase() : '';
}

function isValidEmail_(s) {
  return /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(String(s || '').trim());
}

var WEBMAIL_DOMAINS = [
  'gmail.com', 'googlemail.com', 'outlook.com', 'outlook.com.au', 'hotmail.com',
  'hotmail.com.au', 'live.com', 'live.com.au', 'yahoo.com', 'yahoo.com.au',
  'icloud.com', 'me.com', 'bigpond.com', 'bigpond.net.au', 'optusnet.com.au',
  'iinet.net.au', 'tpg.com.au', 'internode.on.net', 'aol.com', 'proton.me', 'protonmail.com'
];

function emailDomain_(email) {
  var at = String(email || '').lastIndexOf('@');
  return at < 0 ? '' : String(email).slice(at + 1).toLowerCase();
}

/** Drops quoted history ("On ... wrote:", "> ...") from an email reply. */
function stripQuotedReply_(text) {
  var lines = String(text || '').replace(/\r/g, '').split('\n');
  var out = [];
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i];
    var outlookHeader = /^From: .+/.test(l) && out.length > 0 && /^\s*$/.test(lines[i - 1] || '');
    if (/^On .{5,200} wrote:\s*$/.test(l) || /^-{2,}\s*Original Message\s*-{2,}/i.test(l) || outlookHeader) break;
    if (/^>/.test(l)) continue;
    out.push(l);
  }
  return out.join('\n').trim();
}

function escapeHtml_(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Plain text -> simple HTML, with bare links made clickable. */
function textToHtml_(text) {
  return escapeHtml_(text)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
    .replace(/\n/g, '<br>');
}

/**
 * JSON over HTTP with retries on 429 / 5xx. Throws on other errors.
 * The query string is left out of error messages so keys never end up in logs.
 */
function httpJson_(method, url, body, headers) {
  var opts = { method: method, muteHttpExceptions: true, headers: headers || {} };
  if (body !== undefined && body !== null) {
    opts.contentType = 'application/json';
    opts.payload = JSON.stringify(body);
  }
  var waits = [2000, 6000, 15000];
  for (var attempt = 0; ; attempt++) {
    var res = UrlFetchApp.fetch(url, opts);
    var code = res.getResponseCode();
    var text = res.getContentText();
    if ((code === 429 || code >= 500) && attempt < waits.length) {
      Utilities.sleep(waits[attempt]);
      continue;
    }
    var data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
    if (code >= 300) {
      var err = new Error(method + ' ' + url.split('?')[0] + ' failed (' + code + '): ' + truncate_(text, 800));
      err.status = code;
      err.body = data;
      throw err;
    }
    return data;
  }
}

function log_(level, where, message, details) {
  try {
    var sh = ss_().getSheetByName(SHEETS.LOG);
    if (!sh) return;
    sh.appendRow([new Date(), level, where, truncate_(message, 1000),
      details === undefined ? '' : truncate_(typeof details === 'string' ? details : JSON.stringify(details), 5000)]);
  } catch (e) {
    console.error(where + ': ' + message);
  }
}

function logError_(where, err, details) {
  console.error(where, err && err.stack ? err.stack : err);
  log_('ERROR', where, err && err.message ? err.message : String(err), details);
}

// ===== Sheets =====

/**
 * AI Caller: spreadsheet access by column name, so columns can be moved
 * around or added without breaking anything.
 */

function ss_() {
  var active = null;
  try { active = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { active = null; }
  if (active) return active;
  var id = getSecret_(SECRET_KEYS.SPREADSHEET_ID);
  if (!id) throw new Error('Spreadsheet not found. Run "1. Set up sheets" from the AI Caller menu.');
  return SpreadsheetApp.openById(id);
}

function sheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('Missing tab "' + name + '". Run "1. Set up sheets" from the AI Caller menu.');
  return sh;
}

/**
 * Reads a whole tab. Returns { sheet, headers, col: {header: 1-based index}, rows: [record] }.
 * Each record maps header -> value and has _row (sheet row number).
 */
function readTable_(name) {
  var sh = sheet_(name);
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  var headers = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); }) : [];
  var col = {};
  headers.forEach(function (h, i) { if (h && !col[h]) col[h] = i + 1; });
  var rows = [];
  if (lastRow > 1 && lastCol) {
    sh.getRange(2, 1, lastRow - 1, lastCol).getValues().forEach(function (vals, i) {
      var rec = { _row: i + 2 };
      headers.forEach(function (h, j) { if (h) rec[h] = vals[j]; });
      rows.push(rec);
    });
  }
  return { sheet: sh, headers: headers, col: col, rows: rows };
}

/**
 * Writes only the given fields of one row (cell by cell), so two scripts
 * updating different columns of the same lead never overwrite each other.
 */
function updateRow_(table, rec, fields) {
  Object.keys(fields).forEach(function (k) {
    var c = table.col[k];
    if (!c) return;
    table.sheet.getRange(rec._row, c).setValue(fields[k]);
    rec[k] = fields[k];
  });
}

function appendRecord_(name, headers, rec) {
  var sh = sheet_(name);
  var current = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(String);
  var order = current.filter(String).length ? current : headers;
  sh.appendRow(order.map(function (h) { return rec[h] === undefined ? '' : rec[h]; }));
}

function columnLetter_(n) {
  var s = '';
  while (n > 0) {
    var m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function newLeadId_() {
  return 'L-' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();
}

/** Gives every lead a Lead ID and a Status so the rest of the system can track it. */
function ensureLeadIds_(table) {
  table.rows.forEach(function (r) {
    if (!String(r['Business Name'] || r['Phone'] || '').trim()) return;
    var fields = {};
    if (!r['Lead ID']) fields['Lead ID'] = newLeadId_();
    if (!r['Status']) fields['Status'] = STATUS.NEW;
    if (Object.keys(fields).length) updateRow_(table, r, fields);
  });
}

function findLead_(table, predicate) {
  for (var i = 0; i < table.rows.length; i++) {
    if (predicate(table.rows[i])) return table.rows[i];
  }
  return null;
}

// ===== Prompt =====

/**
 * AI Caller: what the voice agent says, and the per-lead brief it gets.
 *
 * Agency details are baked into the assistant when you run
 * "Create/update Vapi assistant". Lead details are passed on every call as
 * {{businessName}} and {{leadBrief}}.
 */

function agencyInfo_() {
  var consultant = setting_('CONSULTANT_NAME');
  return {
    agency: setting_('AGENCY_NAME') || 'our agency',
    website: setting_('AGENCY_WEBSITE'),
    phone: setting_('AGENCY_PHONE'),
    agent: setting_('AGENT_NAME') || 'Alex',
    consultant: consultant || 'one of our consultants',
    consultantShort: consultant || 'the consultant',
    offer: setting_('OFFER') || 'a free 15-minute Google visibility check',
    services: settingList_('SERVICES'),
    pricing: setting_('PRICING_NOTE'),
    bookingLink: setting_('BOOKING_LINK')
  };
}

function buildFirstMessage_() {
  var a = agencyInfo_();
  return 'Hi, this is ' + a.agent + ', an AI assistant calling from ' + a.agency +
    ' — just so you know, this call is recorded. Have I got {{businessName}}?';
}

function buildVoicemailMessage_() {
  var a = agencyInfo_();
  return 'Hi, this is ' + a.agent + ', an AI assistant from ' + a.agency +
    '. I was calling about helping your business get more customers from Google. ' +
    'No need to call back, we\'ll try again another time' +
    (a.website ? ', or you can find us at ' + a.website : '') + '. Thanks, bye!';
}

function buildAgentPrompt_() {
  var a = agencyInfo_();
  var contact = [a.agency, a.website, a.phone].filter(String).join(', ');
  var priceLine = a.pricing
    ? 'If they ask about price: "' + a.pricing + '. ' + a.consultantShort + ' can give an exact quote after the free check."'
    : 'If they ask about price: it depends on the business and the area, which is exactly what the free check works out. ' +
      a.consultantShort + ' gives an exact quote after it. Never make up a number.';

  return [
    '# Role',
    'You are ' + a.agent + ', an AI phone assistant making short outbound calls for ' + a.agency +
      ', an Australian digital marketing agency' + (a.website ? ' (' + a.website + ')' : '') +
      '. You call local Australian businesses.',
    '',
    '# Who you are calling',
    '{{leadBrief}}',
    '',
    '# Goal, in order',
    '1. Reach the owner or whoever looks after marketing.',
    '2. Find out whether getting more customers from Google is a priority for them right now.',
    '3. If there is interest, book ' + a.offer + ' with ' + a.consultant +
      ': agree a day and rough time, and get the best email for the invite.',
    '4. If they would rather read something first, get their email and their OK to send a short summary.',
    'A booked check or permission to email is a win. Do not try to sell a package on this call.',
    '',
    '# What ' + a.agency + ' does',
    a.services.map(function (s) { return '- ' + s; }).join('\n'),
    '',
    '# How to talk',
    '- Friendly, relaxed and polite, like a helpful Australian receptionist. Plain English, no marketing jargon.',
    '- One or two short sentences per turn, then stop and listen. Ask one question at a time.',
    '- If they start talking, stop and listen. Never talk over them.',
    '- Use their name once you know it, but don\'t overdo it.',
    '- Keep the call under three minutes unless they are keen to keep chatting.',
    '- Say email addresses and times back to confirm them. Spell emails letter by letter.',
    '',
    '# Opening',
    'Your first line has already said you are an AI assistant from ' + a.agency + ' and that the call is recorded.',
    'Once they confirm the business, give ONE short reason for calling, based only on the lead details above:',
    '- No Google Business Profile found: "The reason I\'m calling: when we searched for [their type of business] around [their suburb], your business didn\'t come up on Google Maps, and that\'s where most locals look now."',
    '- Profile found but few reviews or a low rating: "You\'re on Google Maps, but a few competitors with more reviews are showing above you."',
    '- No website found: "We couldn\'t find a website for the business, which makes it harder for people who find you on Google to get in touch."',
    '- Otherwise: "We help local businesses like yours get more calls from Google search and Maps."',
    'Then ask: "Is getting more customers from Google something you\'re working on at the moment?"',
    'Only mention facts from the lead details. If they say the details are wrong, apologise and accept it.',
    '',
    '# Situations',
    '- Receptionist or gatekeeper: be polite. Ask who looks after marketing and when is a good time to reach them, or for an email to send information to. Note any name and time.',
    '- Owner is busy: ask for a better day and time to call back, confirm it, and end politely.',
    '- "Just send me an email": great. Get the email, spell it back, and say you\'ll send a short summary' +
      (a.bookingLink ? ' with a link to book the free check' : '') + '.',
    '- Interested: offer ' + a.offer + '. Ask what day and rough time suits this week or next, get the best email for the invite, confirm both back, and say ' + a.consultantShort + ' will confirm by email.',
    '- ' + priceLine,
    '- Already has an agency, or does it themselves: respect that. Ask once if they would like a free second opinion on how they are showing on Google. If not, thank them and end.',
    '- Not interested: acknowledge it and ask at most ONE gentle question (e.g. "Totally fair. Is that because you\'re busy enough already?"). If it is still no, thank them and end. Never push twice.',
    '- "Take me off your list", "don\'t call again", or they are annoyed: apologise, confirm they won\'t be called again, say goodbye and end the call straight away. Don\'t try to change their mind.',
    '- "Where did you get my number?": from the business\'s public listing online, such as Google or a business directory.',
    '- They ask who is calling or for contact details: ' + contact + '.',
    '- "Are you a robot / AI?": always say yes, honestly. You are an AI assistant for ' + a.agency + '.',
    '- Wrong number, or not a business: apologise and end the call.',
    '- A question you can\'t answer: say ' + a.consultantShort + ' can cover it on the call or by email. Never guess.',
    '',
    '# Never',
    '- Never claim to be human.',
    '- Never promise rankings ("number one on Google"), a number of leads, or any guaranteed result.',
    '- Never invent facts about their business, our clients, prices or results.',
    '- Never ask for payment or card details.',
    '- Never criticise competitors or their current agency.',
    '',
    '# Ending',
    'Before hanging up, briefly confirm what was agreed (time, email, next step). Then say a short, friendly goodbye and use the endCall tool.',
    'After a "don\'t call me" request, say goodbye and end the call immediately.'
  ].join('\n');
}

/** The per-call brief shown to the agent as {{leadBrief}}. */
function buildLeadBrief_(lead) {
  var lines = [];
  lines.push('Business: ' + (lead['Business Name'] || 'unknown'));
  if (lead['Category']) lines.push('Type of business: ' + lead['Category']);
  var place = [lead['Suburb'], lead['State']].filter(function (x) { return String(x || '').trim(); }).join(', ');
  if (place) lines.push('Location: ' + place);
  if (lead['Contact Name']) lines.push('Contact name we have (may be out of date): ' + lead['Contact Name']);

  var gbp = yesNo_(lead['Has GBP']);
  if (gbp === 'No') {
    lines.push('Google Business Profile: none found when we searched.');
  } else if (gbp === 'Yes') {
    var bits = [];
    if (lead['GBP Rating'] !== '' && lead['GBP Rating'] !== undefined) bits.push('rating ' + lead['GBP Rating']);
    if (lead['GBP Reviews'] !== '' && lead['GBP Reviews'] !== undefined) bits.push(lead['GBP Reviews'] + ' reviews');
    lines.push('Google Business Profile: yes' + (bits.length ? ' (' + bits.join(', ') + ')' : '') + '.');
  } else {
    lines.push('Google Business Profile: not checked.');
  }

  var site = String(lead['Website'] || '').trim();
  lines.push('Website: ' + (site || 'none found'));

  var notes = String(lead['Notes'] || '').replace(/\bTEST\b/g, '').trim();
  if (notes) lines.push('Our research notes: ' + truncate_(notes, 500));

  if (lead['Summary']) {
    lines.push('');
    lines.push('We have spoken before. Last call: ' + truncate_(lead['Summary'], 600));
    if (lead['Next Step']) lines.push('Agreed next step: ' + lead['Next Step']);
    if (lead['Callback Time']) lines.push('They asked us to call back: ' + lead['Callback Time']);
    lines.push('Mention that you are calling back as agreed, and pick up from there.');
  }
  return lines.join('\n');
}

// ===== Gemini =====

/**
 * AI Caller: Google Gemini (free tier) for scoring calls and writing emails.
 * Get a key at https://aistudio.google.com/apikey
 */

function geminiJson_(prompt, schema, system) {
  var model = setting_('GEMINI_MODEL') || 'gemini-2.5-flash';
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
  var body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseSchema: schema }
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  var data = httpJson_('post', url, body, { 'x-goog-api-key': requireSecret_(SECRET_KEYS.GEMINI_API_KEY) });
  var parts = dig_(data, 'candidates.0.content.parts') || [];
  var text = parts.filter(function (p) { return p.text && !p.thought; }).map(function (p) { return p.text; }).join('');
  if (!text) throw new Error('Gemini returned no text: ' + truncate_(JSON.stringify(data), 500));
  return JSON.parse(text);
}

// ===== Analysis =====

/**
 * AI Caller: turning a finished call into an outcome, score and next step.
 */

var CALL_OUTCOMES = ['interested', 'callback', 'gatekeeper', 'not_interested', 'do_not_call', 'wrong_number', 'voicemail', 'no_conversation'];

var CALL_ANALYSIS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    outcome: { type: 'STRING', enum: CALL_OUTCOMES },
    interestScore: { type: 'INTEGER' },
    summary: { type: 'STRING' },
    decisionMakerReached: { type: 'BOOLEAN' },
    contactName: { type: 'STRING' },
    email: { type: 'STRING' },
    emailConsent: { type: 'BOOLEAN' },
    meetingAgreed: { type: 'BOOLEAN' },
    callbackAt: { type: 'STRING' },
    callbackNote: { type: 'STRING' },
    servicesOfInterest: { type: 'ARRAY', items: { type: 'STRING' } },
    objections: { type: 'STRING' },
    nextStep: { type: 'STRING' }
  },
  required: ['outcome', 'interestScore', 'summary', 'decisionMakerReached', 'contactName', 'email',
    'emailConsent', 'meetingAgreed', 'callbackAt', 'callbackNote', 'servicesOfInterest', 'objections', 'nextStep']
};

/**
 * Sorts Vapi's endedReason into: no_answer, voicemail, failed, conversation.
 * A call only counts as a conversation if the other person actually spoke.
 */
function bucketEndedReason_(endedReason, transcript) {
  var r = String(endedReason || '').toLowerCase();
  var spoke = /(^|\n)\s*(user|customer)\s*:/i.test(String(transcript || ''));
  if (r.indexOf('voicemail') >= 0) return 'voicemail';
  if (/did-not-answer|no-answer|busy|customer-did-not-give|not-reachable/.test(r)) return 'no_answer';
  if (!spoke && /(fail|error|invalid|unavailable|rejected|declined|blocked)/.test(r)) return 'failed';
  return spoke ? 'conversation' : 'no_answer';
}

function analyseCall_(transcript, lead, endedAt) {
  var tz = tzForState_(lead && lead['State'], setting_('DEFAULT_STATE'));
  var when = fmt_(endedAt || new Date(), tz, "EEEE yyyy-MM-dd HH:mm");
  var prompt = [
    'Analyse this outbound sales call made by an AI assistant for ' + (setting_('AGENCY_NAME') || 'a digital marketing agency') +
      ' (SEO, Google Business Profile, lead generation, web design) to an Australian local business.',
    'The call ended on ' + when + ' (' + tz + ', the business\'s local time).',
    '',
    'Business: ' + (lead ? lead['Business Name'] : 'unknown'),
    '',
    'Transcript ("AI" is our assistant, "User" is the business):',
    truncate_(transcript, 30000),
    '',
    'Rules:',
    '- outcome: interested (agreed to a meeting/check, or clearly wants to hear more); callback (decision maker asked us to call back at another time); gatekeeper (spoke to someone else, decision maker not reached); not_interested; do_not_call (asked not to be called again, or asked to be removed); wrong_number; voicemail (reached voicemail or an answering service); no_conversation (no meaningful conversation happened).',
    '- If they asked not to be called again, outcome must be do_not_call, even if they were polite.',
    '- interestScore 0-100: 0-15 hostile or do-not-call; 16-35 polite no; 36-55 open but non-committal, or gatekeeper who gave a name/time; 56-75 asked for info by email; 76-100 agreed to a meeting or asked for a quote.',
    '- summary: 2-3 plain-English sentences for a sales person.',
    '- email: the email address they gave, rebuilt from spoken form (e.g. "john at smith plumbing dot com dot au" -> john@smithplumbing.com.au). Empty if none.',
    '- emailConsent: true only if they agreed to us emailing them.',
    '- callbackAt: if a specific callback day/time or meeting time was agreed, give it as "YYYY-MM-DD HH:mm" in the business\'s local time, resolving words like "Thursday arvo" against the call date (afternoon = 14:00, morning = 10:00). Empty if none.',
    '- callbackNote: the callback/meeting time in their words, plus who to ask for. Empty if none.',
    '- contactName: name and role of the decision maker if mentioned, else empty.',
    '- nextStep: one short line on what we should do next.',
    '- Do not invent anything that is not in the transcript.'
  ].join('\n');

  var a = geminiJson_(prompt, CALL_ANALYSIS_SCHEMA);
  a.outcome = CALL_OUTCOMES.indexOf(a.outcome) >= 0 ? a.outcome : 'no_conversation';
  a.interestScore = Math.max(0, Math.min(100, Math.round(Number(a.interestScore) || 0)));
  a.email = isValidEmail_(a.email) ? String(a.email).trim().toLowerCase() : '';
  a.servicesOfInterest = Array.isArray(a.servicesOfInterest) ? a.servicesOfInterest : [];
  return a;
}

/** Used when Gemini is down: keep Vapi's own summary and flag the call for a manual look. */
function fallbackAnalysis_(report, reason) {
  return {
    outcome: 'no_conversation',
    interestScore: 0,
    summary: (dig_(report, 'analysis.summary') || dig_(report, 'summary') || 'Call finished.') +
      ' [Automatic scoring failed: ' + truncate_(reason, 150) + '. Please listen to the recording.]',
    decisionMakerReached: false, contactName: '', email: '', emailConsent: false, meetingAgreed: false,
    callbackAt: '', callbackNote: '', servicesOfInterest: [], objections: '', nextStep: 'Review this call manually.',
    needsReview: true
  };
}

/**
 * Works out the lead's new fields from a call result. Pure function, so it is easy to test.
 * bucket: from bucketEndedReason_. a: analysis (conversation only).
 */
function leadUpdateForCall_(lead, bucket, a, now, cfg) {
  var attempts = Number(lead['Attempts']) || 0;
  var retryAt = new Date(now.getTime() + cfg.retryHours * 3600000);
  var f = { 'Updated At': now };

  function unanswered(label) {
    attempts += 1;
    f['Attempts'] = attempts;
    f['Outcome'] = label;
    if (attempts >= cfg.maxAttempts) {
      f['Status'] = STATUS.NO_ANSWER;
      f['Next Attempt At'] = '';
    } else {
      f['Status'] = STATUS.RETRY;
      f['Next Attempt At'] = retryAt;
    }
  }

  if (bucket === 'no_answer') { unanswered('No answer'); return f; }
  if (bucket === 'voicemail' || a.outcome === 'voicemail') { unanswered('Voicemail'); return f; }
  if (bucket === 'failed') { unanswered('Call failed'); return f; }

  if (a.needsReview) {
    // Someone spoke but scoring failed. Don't redial until a person has looked at it.
    f['Status'] = STATUS.REVIEW;
    f['Outcome'] = 'Needs review';
    f['Summary'] = a.summary;
    f['Next Attempt At'] = '';
    return f;
  }
  if (a.outcome === 'no_conversation') { unanswered('No conversation'); return f; }

  f['Interest Score'] = a.interestScore;
  f['Summary'] = a.summary;
  f['Next Step'] = a.nextStep;
  f['Callback Time'] = a.callbackNote || a.callbackAt || '';
  if (a.servicesOfInterest && a.servicesOfInterest.length) f['Services Interested'] = a.servicesOfInterest.join(', ');
  if (a.contactName && !String(lead['Contact Name'] || '').trim()) f['Contact Name'] = a.contactName;
  if (a.email) f['Email'] = a.email;

  var callbackDate = a.callbackAt ? localToDate_(a.callbackAt, cfg.tz) : null;
  if (callbackDate && callbackDate.getTime() < now.getTime()) callbackDate = null;

  switch (a.outcome) {
    case 'interested':
      f['Status'] = STATUS.INTERESTED;
      f['Outcome'] = a.meetingAgreed ? 'Meeting agreed' : 'Interested';
      f['Attempts'] = 0;
      f['Next Attempt At'] = '';
      break;
    case 'callback':
    case 'gatekeeper':
      f['Outcome'] = a.outcome === 'callback' ? 'Call back' : 'Gatekeeper';
      if (callbackDate || a.outcome === 'callback') {
        f['Status'] = STATUS.CALLBACK;
        f['Next Attempt At'] = callbackDate || retryAt;
        f['Attempts'] = 0;
      } else {
        attempts += 1;
        f['Attempts'] = attempts;
        f['Status'] = attempts >= cfg.maxAttempts ? STATUS.NO_ANSWER : STATUS.RETRY;
        f['Next Attempt At'] = attempts >= cfg.maxAttempts ? '' : retryAt;
      }
      break;
    case 'not_interested':
      f['Status'] = STATUS.NOT_INTERESTED;
      f['Outcome'] = 'Not interested';
      f['Next Attempt At'] = '';
      break;
    case 'do_not_call':
      f['Status'] = STATUS.DNC;
      f['Outcome'] = 'Asked not to be called';
      f['Approved'] = false;
      f['Next Attempt At'] = '';
      break;
    case 'wrong_number':
      f['Status'] = STATUS.WRONG_NUMBER;
      f['Outcome'] = 'Wrong number';
      f['Approved'] = false;
      f['Next Attempt At'] = '';
      break;
  }
  return f;
}

// ===== Vapi =====

/**
 * AI Caller: Vapi API (voice agent, phone numbers, calls).
 * Docs: https://docs.vapi.ai/api-reference
 */

var VAPI_BASE = 'https://api.vapi.ai';

/** Fields Vapi has renamed over time. Dropped and retried if the API rejects them. */
var VAPI_OPTIONAL_FIELDS = ['voicemailDetection', 'backgroundSound', 'artifactPlan', 'endCallMessage', 'silenceTimeoutSeconds'];

function vapi_(method, path, body) {
  return httpJson_(method, VAPI_BASE + path, body, {
    Authorization: 'Bearer ' + requireSecret_(SECRET_KEYS.VAPI_API_KEY)
  });
}

function webhookUrl_() {
  var base = requireSecret_(SECRET_KEYS.WEBAPP_URL);
  return base + (base.indexOf('?') >= 0 ? '&' : '?') + 'token=' +
    encodeURIComponent(requireSecret_(SECRET_KEYS.WEBHOOK_TOKEN));
}

function buildAssistantConfig_() {
  return {
    name: truncate_(setting_('AGENCY_NAME') + ' caller', 40),
    firstMessage: buildFirstMessage_(),
    model: {
      provider: setting_('VAPI_LLM_PROVIDER') || 'openai',
      model: setting_('VAPI_LLM_MODEL') || 'gpt-4o-mini',
      temperature: 0.4,
      messages: [{ role: 'system', content: buildAgentPrompt_() }],
      tools: [{ type: 'endCall' }]
    },
    voice: {
      provider: setting_('VAPI_VOICE_PROVIDER') || 'vapi',
      voiceId: setting_('VAPI_VOICE_ID') || 'Elliot'
    },
    transcriber: { provider: 'deepgram', model: 'nova-2', language: 'en-AU' },
    voicemailDetection: { provider: 'vapi' },
    voicemailMessage: buildVoicemailMessage_(),
    endCallMessage: 'Thanks for your time, have a great day!',
    backgroundSound: 'office',
    maxDurationSeconds: 360,
    silenceTimeoutSeconds: 20,
    artifactPlan: { recordingEnabled: true },
    server: { url: webhookUrl_() },
    serverMessages: ['end-of-call-report']
  };
}

/** Sends an assistant config, dropping optional fields Vapi says it doesn't accept. */
function saveAssistantConfig_(method, path, config) {
  var dropped = [];
  for (var i = 0; i <= VAPI_OPTIONAL_FIELDS.length; i++) {
    try {
      var res = vapi_(method, path, config);
      return { assistant: res, dropped: dropped };
    } catch (e) {
      if (e.status !== 400) throw e;
      var msg = JSON.stringify(e.body || e.message);
      var bad = VAPI_OPTIONAL_FIELDS.filter(function (f) { return config[f] !== undefined && msg.indexOf(f) >= 0; });
      if (!bad.length) throw e;
      bad.forEach(function (f) { delete config[f]; dropped.push(f); });
    }
  }
  throw new Error('Vapi kept rejecting the assistant config.');
}

/** Creates the assistant the first time, updates it after that. Returns a message for the user. */
function syncVapiAssistant_() {
  var config = buildAssistantConfig_();
  var id = getSecret_(SECRET_KEYS.VAPI_ASSISTANT_ID);
  var result;
  if (id) {
    try {
      result = saveAssistantConfig_('PATCH', '/assistant/' + id, config);
    } catch (e) {
      if (e.status !== 404) throw e;
      id = '';
    }
  }
  if (!id) {
    result = saveAssistantConfig_('POST', '/assistant', config);
    setSecret_(SECRET_KEYS.VAPI_ASSISTANT_ID, result.assistant.id);
  }
  var note = result.dropped.length ? ' (Vapi did not accept: ' + result.dropped.join(', ') + '. Not a problem.)' : '';
  log_('INFO', 'syncVapiAssistant', 'Assistant saved: ' + result.assistant.id + note);
  return 'Vapi assistant saved: ' + result.assistant.id + note;
}

function listVapiPhoneNumbers_() {
  var res = vapi_('get', '/phone-number');
  var list = Array.isArray(res) ? res : (res && res.results) || [];
  return list.map(function (p) {
    return { id: p.id, number: p.number || p.sipUri || '', provider: p.provider || '', name: p.name || '' };
  });
}

/** Starts an outbound call. Returns Vapi's call object (has .id). */
function startVapiCall_(lead, phone) {
  return vapi_('post', '/call', {
    assistantId: requireSecret_(SECRET_KEYS.VAPI_ASSISTANT_ID),
    phoneNumberId: requireSecret_(SECRET_KEYS.VAPI_PHONE_NUMBER_ID),
    customer: { number: phone, name: truncate_(lead['Business Name'] || 'Lead', 40) },
    assistantOverrides: {
      variableValues: {
        businessName: String(lead['Business Name'] || 'your business'),
        leadBrief: buildLeadBrief_(lead)
      }
    }
  });
}

function getVapiCall_(callId) {
  return vapi_('get', '/call/' + encodeURIComponent(callId));
}

/** Makes a finished call fetched from the API look like an end-of-call-report webhook. */
function callToReport_(call) {
  return {
    type: 'end-of-call-report',
    call: call,
    endedReason: call.endedReason,
    startedAt: call.startedAt,
    endedAt: call.endedAt,
    cost: call.cost,
    artifact: call.artifact || {},
    analysis: call.analysis || {},
    transcript: call.transcript,
    recordingUrl: call.recordingUrl
  };
}

// ===== Caller =====

/**
 * AI Caller: picking leads and placing calls.
 */

// A function, not a top-level var: Apps Script may load this file before Config.js.
function callableStatuses_() {
  return [STATUS.NEW, STATUS.RETRY, STATUS.CALLBACK, ''];
}

function callConfig_() {
  return {
    days: settingList_('CALL_DAYS'),
    start: setting_('CALL_START') || '09:30',
    end: setting_('CALL_END') || '16:30',
    blocked: settingList_('BLOCKED_DATES'),
    defaultState: setting_('DEFAULT_STATE') || 'NSW',
    maxAttempts: settingNum_('MAX_ATTEMPTS', 3),
    retryHours: settingNum_('RETRY_AFTER_HOURS', 26),
    autoCallbacks: settingBool_('AUTO_CALLBACKS')
  };
}

/** Why a lead should not be called right now ('' = OK to call). Pure, for testing. */
function leadSkipReason_(lead, now, cfg) {
  if (!String(lead['Business Name'] || '').trim() && !String(lead['Phone'] || '').trim()) return 'empty row';
  if (!toBool_(lead['Approved'])) return 'not approved';
  var status = String(lead['Status'] || '').trim();
  if (callableStatuses_().indexOf(status) < 0) return 'status ' + status;
  if (status === STATUS.CALLBACK && !cfg.autoCallbacks) return 'callbacks are manual';
  if ((Number(lead['Attempts']) || 0) >= cfg.maxAttempts && status !== STATUS.CALLBACK) return 'max attempts';
  var next = lead['Next Attempt At'];
  if (next instanceof Date && next.getTime() > now.getTime()) return 'not due yet';
  if (!normaliseAuPhone_(lead['Phone'])) return 'bad phone';
  var tz = tzForState_(lead['State'], cfg.defaultState);
  if (!isWithinCallWindow_(now, tz, cfg)) return 'outside calling hours';
  return '';
}

function todayKey_() {
  return 'CALLS_' + fmt_(new Date(), HOME_TZ, 'yyyyMMdd');
}

function callsPlacedToday_() {
  return Number(PropertiesService.getScriptProperties().getProperty(todayKey_())) || 0;
}

function countCallPlaced_() {
  var props = PropertiesService.getScriptProperties();
  props.setProperty(todayKey_(), String(callsPlacedToday_() + 1));
}

/** Places one call and marks the lead as Calling. Throws on API errors. */
function placeCall_(table, lead) {
  var phone = normaliseAuPhone_(lead['Phone']);
  if (!phone) {
    updateRow_(table, lead, { 'Status': STATUS.BAD_PHONE, 'Updated At': new Date() });
    return null;
  }
  if (!lead['Lead ID']) updateRow_(table, lead, { 'Lead ID': newLeadId_() });
  var call = startVapiCall_(lead, phone);
  updateRow_(table, lead, {
    'Status': STATUS.CALLING,
    'Last Call At': new Date(),
    'Last Call ID': call.id,
    'Updated At': new Date()
  });
  countCallPlaced_();
  log_('INFO', 'placeCall', 'Calling ' + lead['Business Name'] + ' ' + phone, { callId: call.id, leadId: lead['Lead ID'] });
  return call;
}

/** Time-driven trigger (every 10 minutes): places the next few calls. */
function callNextLeads() {
  // Nobody in Australia can be called overnight (Perth 8pm = 11pm Sydney): skip, to save the
  // daily trigger-runtime quota. Stuck calls get picked up in the morning.
  var sydneyHour = Number(fmt_(new Date(), HOME_TZ, 'HH'));
  if (sydneyHour < 8 || sydneyHour >= 23) return;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    reconcileStuckCalls_();
    var cfg = callConfig_();
    var perRun = settingNum_('CALLS_PER_RUN', 2);
    var daily = settingNum_('DAILY_CALL_LIMIT', 30);
    var table = readTable_(SHEETS.LEADS);
    ensureLeadIds_(table);
    var now = new Date();
    var placed = 0;
    for (var i = 0; i < table.rows.length && placed < perRun; i++) {
      if (callsPlacedToday_() >= daily) break;
      var lead = table.rows[i];
      if (leadSkipReason_(lead, now, cfg)) continue;
      try {
        if (placeCall_(table, lead)) placed++;
      } catch (e) {
        logError_('callNextLeads', e, { lead: lead['Business Name'] });
        var attempts = (Number(lead['Attempts']) || 0) + 1;
        updateRow_(table, lead, {
          'Status': attempts >= cfg.maxAttempts ? STATUS.NO_ANSWER : STATUS.RETRY,
          'Attempts': attempts,
          'Outcome': 'Could not start call: ' + truncate_(e.message, 120),
          'Next Attempt At': new Date(now.getTime() + 3600000),
          'Updated At': now
        });
        if (e.status === 401 || e.status === 402 || e.status === 403) break; // key or credit problem: stop for now
      }
    }
  } finally {
    lock.releaseLock();
  }
}

/**
 * Leads stuck on "Calling" (webhook missed): fetch the call from Vapi and
 * process it as if the webhook had arrived.
 */
function reconcileStuckCalls_() {
  var table = readTable_(SHEETS.LEADS);
  var now = Date.now();
  table.rows.forEach(function (lead) {
    if (lead['Status'] !== STATUS.CALLING || !lead['Last Call ID']) return;
    var started = lead['Last Call At'] instanceof Date ? lead['Last Call At'].getTime() : 0;
    if (now - started < 15 * 60000) return;
    try {
      var call = getVapiCall_(lead['Last Call ID']);
      if (call.status === 'ended') {
        processEndOfCallReport_(callToReport_(call));
      } else if (now - started > 90 * 60000) {
        updateRow_(table, lead, { 'Status': STATUS.RETRY, 'Outcome': 'Call status unknown (' + call.status + ')', 'Updated At': new Date() });
      }
    } catch (e) {
      logError_('reconcileStuckCalls', e, { callId: lead['Last Call ID'] });
      if (now - started > 90 * 60000) {
        updateRow_(table, lead, { 'Status': STATUS.RETRY, 'Outcome': 'Call status unknown', 'Updated At': new Date() });
      }
    }
  });
}

/** Menu: call the lead in the selected row right now (for testing). */
function callSelectedLead() {
  var ui = SpreadsheetApp.getUi();
  var sh = SpreadsheetApp.getActiveSheet();
  if (sh.getName() !== SHEETS.LEADS) { ui.alert('Click a row on the Leads tab first.'); return; }
  var row = sh.getActiveRange().getRow();
  var table = readTable_(SHEETS.LEADS);
  var lead = findLead_(table, function (r) { return r._row === row; });
  if (!lead) { ui.alert('Click a lead row (not the header).'); return; }
  if ([STATUS.DNC, STATUS.WRONG_NUMBER].indexOf(lead['Status']) >= 0) {
    ui.alert('This lead is marked "' + lead['Status'] + '". Not calling.');
    return;
  }
  var phone = normaliseAuPhone_(lead['Phone']);
  if (!phone) { ui.alert('Phone number "' + lead['Phone'] + '" is not a number we can dial.'); return; }
  var cfg = callConfig_();
  var tz = tzForState_(lead['State'], cfg.defaultState);
  var outside = !isWithinCallWindow_(new Date(), tz, cfg);
  var msg = 'Call ' + (lead['Business Name'] || '(no name)') + ' on ' + phone + ' now?' +
    (outside ? '\n\nWarning: it is outside your calling hours for this lead (' + fmt_(new Date(), tz, 'EEE HH:mm') + ' there). Only call your own phone outside hours.' : '');
  if (ui.alert('AI Caller', msg, ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  try {
    var call = placeCall_(table, lead);
    ui.alert('Call started (ID ' + call.id + '). The result will appear on the Calls tab a minute or so after the call ends.');
  } catch (e) {
    logError_('callSelectedLead', e);
    ui.alert('Could not start the call:\n\n' + e.message);
  }
}

// ===== Webhook =====

/**
 * AI Caller: the web app Vapi sends its end-of-call report to.
 *
 * Deploy: Deploy > New deployment > Web app, Execute as "Me",
 * Who has access "Anyone". Apps Script can't read request headers, so the
 * webhook is protected by a secret ?token=... in the URL instead.
 */

function doGet() {
  return ContentService.createTextOutput('AI Caller is running.');
}

function doPost(e) {
  var reply = function (obj) {
    return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
  };
  try {
    var token = e && e.parameter ? e.parameter.token : '';
    if (!token || token !== getSecret_(SECRET_KEYS.WEBHOOK_TOKEN)) return reply({ ok: false, error: 'unauthorised' });
    var body = JSON.parse((e.postData && e.postData.contents) || '{}');
    var msg = body.message || body;
    if (msg.type !== 'end-of-call-report') return reply({ ok: true, ignored: msg.type || 'unknown' });
    processEndOfCallReport_(msg);
    return reply({ ok: true });
  } catch (err) {
    logError_('doPost', err);
    return reply({ ok: false });
  }
}

function callAlreadyProcessed_(callId) {
  var cache = CacheService.getScriptCache();
  if (cache.get('eoc_' + callId)) return true;
  cache.put('eoc_' + callId, '1', 900); // guards against a duplicate webhook while this one runs
  var sh = sheet_(SHEETS.CALLS);
  if (sh.getLastRow() < 2) return false;
  var col = CALL_HEADERS.indexOf('Call ID') + 1;
  var ids = sh.getRange(2, col, sh.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (ids[i][0] === callId) return true;
  return false;
}

function reportDuration_(report) {
  var d = Number(report.durationSeconds || dig_(report, 'call.durationSeconds'));
  if (d) return Math.round(d);
  var s = Date.parse(report.startedAt || dig_(report, 'call.startedAt') || '');
  var e = Date.parse(report.endedAt || dig_(report, 'call.endedAt') || '');
  return s && e && e > s ? Math.round((e - s) / 1000) : 0;
}

/** Handles a finished call: scores it, saves the recording, updates the lead, sends alerts and emails. */
function processEndOfCallReport_(report) {
  var call = report.call || {};
  var callId = call.id || report.callId || '';
  if (!callId) { log_('WARN', 'endOfCall', 'Report without call id'); return; }
  if (callAlreadyProcessed_(callId)) return;

  var transcript = dig_(report, 'artifact.transcript') || report.transcript || '';
  var recordingUrl = dig_(report, 'artifact.recordingUrl') || report.recordingUrl ||
    dig_(report, 'artifact.recording.mono.combinedUrl') || '';
  var endedReason = report.endedReason || call.endedReason || '';
  var customerNumber = normaliseAuPhone_(dig_(call, 'customer.number') || dig_(report, 'customer.number') || '');
  var now = new Date();

  var table = readTable_(SHEETS.LEADS);
  var lead = findLead_(table, function (r) { return r['Last Call ID'] === callId; }) ||
    (customerNumber ? findLead_(table, function (r) { return normaliseAuPhone_(r['Phone']) === customerNumber; }) : null);

  var cfg = callConfig_();
  cfg.tz = tzForState_(lead && lead['State'], cfg.defaultState);

  var bucket = bucketEndedReason_(endedReason, transcript);
  var a = null;
  if (bucket === 'conversation') {
    try {
      a = analyseCall_(transcript, lead, report.endedAt ? new Date(report.endedAt) : now);
    } catch (e) {
      logError_('analyseCall', e, { callId: callId });
      a = fallbackAnalysis_(report, e.message);
    }
  }

  var files = { recording: '', transcript: '' };
  if (bucket === 'conversation' || bucket === 'voicemail') {
    files = saveCallFiles_(callId, lead, recordingUrl, transcript, now);
  }

  var fields = null;
  if (lead) {
    fields = leadUpdateForCall_(lead, bucket, a || {}, now, cfg);
    if (files.recording) fields['Recording'] = files.recording;
    updateRow_(table, lead, fields);
  } else {
    log_('WARN', 'endOfCall', 'No lead matched call ' + callId + ' (' + customerNumber + ')');
  }

  appendRecord_(SHEETS.CALLS, CALL_HEADERS, {
    'Received At': now,
    'Call ID': callId,
    'Lead ID': lead ? lead['Lead ID'] : '',
    'Business Name': lead ? lead['Business Name'] : '',
    'Phone': customerNumber,
    'Ended Reason': endedReason,
    'Duration (s)': reportDuration_(report),
    'Cost (USD)': Number(report.cost || call.cost) || '',
    'Outcome': a ? a.outcome : bucket,
    'Interest Score': a ? a.interestScore : '',
    'Decision Maker': a ? (a.decisionMakerReached ? 'Yes' : 'No') : '',
    'Summary': a ? a.summary : '',
    'Objections': a ? a.objections : '',
    'Next Step': a ? a.nextStep : '',
    'Callback Time': a ? (a.callbackNote || a.callbackAt) : '',
    'Email Captured': a ? a.email : '',
    'Recording': files.recording || recordingUrl,
    'Transcript File': files.transcript,
    'Transcript': truncate_(transcript, 40000)
  });

  if (!lead || !a || a.needsReview) return;

  var hot = a.outcome === 'interested' || a.interestScore >= settingNum_('HOT_SCORE', 70);
  if (hot) {
    try {
      notifyHotLead_(lead, {
        source: 'Phone call', score: a.interestScore, summary: a.summary, nextStep: a.nextStep,
        callback: a.callbackNote || a.callbackAt, email: a.email || lead['Email'],
        recording: files.recording || recordingUrl, meeting: a.meetingAgreed
      });
    } catch (e) { logError_('notifyHotLead', e); }
  }

  var wantsEmail = a.emailConsent && (a.email || isValidEmail_(lead['Email'])) &&
    ['interested', 'callback', 'gatekeeper'].indexOf(a.outcome) >= 0;
  if (wantsEmail) {
    try {
      sendCallFollowUp_(table, lead, a);
    } catch (e) { logError_('sendCallFollowUp', e, { callId: callId }); }
  }
}

/** Copies the recording and transcript into the Drive folder. Returns their links. */
function saveCallFiles_(callId, lead, recordingUrl, transcript, when) {
  var out = { recording: '', transcript: '' };
  try {
    var folder = DriveApp.getFolderById(requireSecret_(SECRET_KEYS.DRIVE_FOLDER_ID));
    var base = fmt_(when, HOME_TZ, 'yyyy-MM-dd HHmm') + ' - ' +
      String((lead && lead['Business Name']) || 'Unknown').replace(/[\\/:*?"<>|]/g, '').slice(0, 60) +
      ' - ' + callId.slice(0, 8);
    if (recordingUrl) {
      var res = UrlFetchApp.fetch(recordingUrl, { muteHttpExceptions: true });
      if (res.getResponseCode() < 300) {
        var ext = (recordingUrl.split('?')[0].match(/\.(wav|mp3|m4a|ogg)$/i) || [, 'wav'])[1];
        var blob = res.getBlob().setName(base + '.' + ext);
        out.recording = folder.createFile(blob).getUrl();
      } else {
        log_('WARN', 'saveCallFiles', 'Recording download failed (' + res.getResponseCode() + ')', { callId: callId });
      }
    }
    if (transcript) {
      out.transcript = folder.createFile(base + '.txt', transcript, MimeType.PLAIN_TEXT).getUrl();
    }
  } catch (e) {
    logError_('saveCallFiles', e, { callId: callId });
  }
  return out;
}

// ===== Email =====

/**
 * AI Caller: follow-up emails after calls, and replies to leads who email back.
 *
 * By default everything is saved as a Gmail draft for you to check and send.
 * Set AUTO_SEND_FOLLOWUPS / AUTO_SEND_REPLIES to TRUE on the Settings tab
 * once you trust what it writes.
 */

var GMAIL_LABEL = 'AI Caller';

var FOLLOWUP_SCHEMA = {
  type: 'OBJECT',
  properties: { subject: { type: 'STRING' }, body: { type: 'STRING' } },
  required: ['subject', 'body']
};

var EMAIL_INTENTS = ['interested', 'meeting_request', 'question', 'wants_info', 'not_interested', 'unsubscribe', 'out_of_office', 'other'];

var EMAIL_REPLY_SCHEMA = {
  type: 'OBJECT',
  properties: {
    intent: { type: 'STRING', enum: EMAIL_INTENTS },
    interestScore: { type: 'INTEGER' },
    summary: { type: 'STRING' },
    shouldReply: { type: 'BOOLEAN' },
    needsHuman: { type: 'BOOLEAN' },
    replyBody: { type: 'STRING' }
  },
  required: ['intent', 'interestScore', 'summary', 'shouldReply', 'needsHuman', 'replyBody']
};

function gmailLabel_() {
  return GmailApp.getUserLabelByName(GMAIL_LABEL) || GmailApp.createLabel(GMAIL_LABEL);
}

function emailFooter_() {
  var sig = setting_('EMAIL_SIGNATURE').replace(/\\n/g, '\n');
  var addr = setting_('BUSINESS_ADDRESS');
  return '\n\n' + sig + '\n\n--\n' + (addr ? addr + '\n' : '') +
    'Not interested? Just reply "unsubscribe" and we won\'t email you again.';
}

function agencyContextForEmail_() {
  var a = agencyInfo_();
  return [
    'Agency: ' + a.agency + (a.website ? ' (' + a.website + ')' : ''),
    'Services: ' + a.services.join('; '),
    'Main offer: ' + a.offer + ' with ' + a.consultant,
    'Pricing: ' + (a.pricing || 'not public; the consultant quotes after the free check. Never state a price.'),
    'Booking link: ' + (a.bookingLink || 'none; say the consultant will email some times')
  ].join('\n');
}

function ensureBookingLink_(body) {
  var link = setting_('BOOKING_LINK');
  if (!link || body.indexOf(link) >= 0) return body;
  return body + '\n\nYou can pick a time that suits here: ' + link;
}

/** Saves as a draft, or sends if auto is true. Returns the GmailMessage when sent, else the draft. */
function draftOrSend_(draft, auto) {
  var thread = draft.getMessage().getThread();
  thread.addLabel(gmailLabel_());
  if (auto) return { sent: true, message: draft.send(), threadId: thread.getId() };
  return { sent: false, message: draft.getMessage(), threadId: thread.getId() };
}

/** After a call where the lead agreed to an email. */
function sendCallFollowUp_(table, lead, a) {
  var to = a.email || String(lead['Email'] || '').trim();
  if (!isValidEmail_(to)) return;
  var info = agencyInfo_();
  var content;
  try {
    content = geminiJson_([
      'Write a short follow-up email after a phone call.',
      agencyContextForEmail_(),
      '',
      'Business: ' + lead['Business Name'] + (lead['Category'] ? ' (' + lead['Category'] + ')' : '') +
        (lead['Suburb'] ? ', ' + lead['Suburb'] : ''),
      'Contact: ' + (a.contactName || lead['Contact Name'] || 'unknown'),
      'What happened on the call: ' + a.summary,
      'Agreed next step: ' + a.nextStep,
      'Meeting time agreed: ' + (a.callbackNote || a.callbackAt || 'none'),
      '',
      'Rules: 80-140 words, friendly Australian English, plain text, no markdown. ' +
        'Say it follows up the call they had today with ' + info.agent + ', our AI assistant. ' +
        'Recap in one line why it could help them, then the next step (confirm the agreed time, or invite them to book ' + info.offer + '). ' +
        'Do not invent facts, results, clients or prices. Do not add a signature. Greet them by first name if known, otherwise "Hi there".'
    ].join('\n'), FOLLOWUP_SCHEMA);
  } catch (e) {
    logError_('followUp.gemini', e);
    content = {
      subject: 'Following up our call - ' + lead['Business Name'],
      body: 'Hi there,\n\nThanks for chatting with ' + info.agent + ', our AI assistant, today. As promised, here are the details of ' +
        info.offer + ': ' + info.consultant + ' will look at how ' + lead['Business Name'] +
        ' shows up on Google and Maps, and what would bring in more local customers.\n\nJust reply to this email with a time that suits.'
    };
  }
  var body = ensureBookingLink_(String(content.body).trim()) + emailFooter_();
  var draft = GmailApp.createDraft(to, content.subject, body, { htmlBody: textToHtml_(body), name: info.agency });
  var auto = settingBool_('AUTO_SEND_FOLLOWUPS');
  var res = draftOrSend_(draft, auto);
  var now = new Date();
  updateRow_(table, lead, { 'Email Status': res.sent ? 'Follow-up sent' : 'Follow-up draft ready', 'Last Email At': now });
  appendRecord_(SHEETS.EMAILS, EMAIL_HEADERS, {
    'Processed At': now, 'Message ID': res.message.getId(), 'Thread ID': res.threadId, 'Lead ID': lead['Lead ID'],
    'Direction': 'Out', 'From': 'me', 'To': to, 'Subject': content.subject, 'Intent': 'follow-up',
    'Action': res.sent ? 'Sent' : 'Draft saved', 'Summary': '', 'Body Preview': truncate_(body, 500)
  });
}

/** Time-driven trigger (every 15 minutes): handles new emails from leads. */
function processInbox() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    var props = PropertiesService.getScriptProperties();
    var since = Number(props.getProperty(SECRET_KEYS.INBOX_SINCE));
    if (!since) { props.setProperty(SECRET_KEYS.INBOX_SINCE, String(Date.now())); return; }

    var table = readTable_(SHEETS.LEADS);
    var byEmail = {}, byDomain = {}, domainCount = {};
    table.rows.forEach(function (r) {
      var e = String(r['Email'] || '').trim().toLowerCase();
      if (!isValidEmail_(e)) return;
      byEmail[e] = r;
      var d = emailDomain_(e);
      if (WEBMAIL_DOMAINS.indexOf(d) < 0) { byDomain[d] = r; domainCount[d] = (domainCount[d] || 0) + 1; }
    });
    Object.keys(domainCount).forEach(function (d) { if (domainCount[d] > 1) delete byDomain[d]; });

    var emails = readTable_(SHEETS.EMAILS);
    var processed = {}, threadLead = {};
    emails.rows.forEach(function (r) {
      if (r['Message ID']) processed[r['Message ID']] = true;
      if (r['Thread ID'] && r['Lead ID']) threadLead[r['Thread ID']] = r['Lead ID'];
    });
    var leadById = {};
    table.rows.forEach(function (r) { if (r['Lead ID']) leadById[r['Lead ID']] = r; });

    var mine = [Session.getEffectiveUser().getEmail()].concat(GmailApp.getAliases()).map(function (x) { return String(x).toLowerCase(); });

    GmailApp.search('in:inbox newer_than:7d', 0, 50).forEach(function (thread) {
      var pending = thread.getMessages().filter(function (m) {
        var from = extractEmail_(m.getFrom());
        return !processed[m.getId()] && m.getDate().getTime() >= since && mine.indexOf(from) < 0 &&
          !/^(no-?reply|mailer-daemon|postmaster)@/i.test(from);
      });
      if (!pending.length) return;
      var last = pending[pending.length - 1];
      var from = extractEmail_(last.getFrom());
      var lead = byEmail[from] || byDomain[emailDomain_(from)] || leadById[threadLead[thread.getId()]] || null;
      if (!lead) return;
      pending.slice(0, -1).forEach(function (m) {
        appendRecord_(SHEETS.EMAILS, EMAIL_HEADERS, {
          'Processed At': new Date(), 'Message ID': m.getId(), 'Thread ID': thread.getId(), 'Lead ID': lead['Lead ID'],
          'Direction': 'In', 'From': m.getFrom(), 'Subject': m.getSubject(), 'Action': 'Skipped (newer message in thread)'
        });
      });
      try {
        handleLeadEmail_(table, lead, thread, last);
      } catch (e) {
        logError_('handleLeadEmail', e, { from: from, subject: last.getSubject() });
      }
    });
  } finally {
    lock.releaseLock();
  }
}

function handleLeadEmail_(table, lead, thread, message) {
  var info = agencyInfo_();
  var body = truncate_(stripQuotedReply_(message.getPlainBody()), 4000);
  var history = thread.getMessages().slice(-5, -1).map(function (m) {
    return 'From: ' + m.getFrom() + '\n' + truncate_(stripQuotedReply_(m.getPlainBody()), 1200);
  }).join('\n---\n');

  var r = geminiJson_([
    'You handle email replies from potential clients for an Australian digital marketing agency.',
    agencyContextForEmail_(),
    '',
    'Lead: ' + lead['Business Name'] + (lead['Category'] ? ' (' + lead['Category'] + ')' : '') +
      (lead['Suburb'] ? ', ' + lead['Suburb'] + ' ' + (lead['State'] || '') : ''),
    'What we know: ' + (lead['Summary'] || 'no call notes yet'),
    '',
    'Earlier messages in this thread:',
    history || '(none)',
    '',
    'NEW EMAIL from ' + message.getFrom() + ', subject "' + message.getSubject() + '":',
    body,
    '',
    'Tasks:',
    '- intent: interested, meeting_request (wants to book or proposes a time), question, wants_info, not_interested, unsubscribe (asks to stop emails/calls or be removed), out_of_office (auto-reply), other.',
    '- interestScore 0-100.',
    '- summary: one line for the sales person.',
    '- shouldReply: false for not_interested, unsubscribe, out_of_office and anything that needs no answer.',
    '- needsHuman: true if they ask something you can\'t answer from the agency info above (exact prices, contracts, technical details, complaints), or propose a specific meeting time that a person must confirm.',
    '- replyBody: if shouldReply, a reply of 50-130 words in friendly Australian English, plain text, no signature. ' +
      'Answer only from the agency info. Never invent prices, results or availability. ' +
      'If they want to meet, ' + (info.bookingLink ? 'share the booking link.' : 'say ' + info.consultantShort + ' will confirm a time shortly.') +
      ' If needsHuman, say ' + info.consultantShort + ' will get back to them shortly with the details. Empty if no reply.'
  ].join('\n'), EMAIL_REPLY_SCHEMA);

  var intent = EMAIL_INTENTS.indexOf(r.intent) >= 0 ? r.intent : 'other';
  var score = Math.max(0, Math.min(100, Math.round(Number(r.interestScore) || 0)));
  var now = new Date();
  var fields = { 'Last Email At': now, 'Updated At': now };
  var action = 'No reply needed';

  if (intent === 'unsubscribe') {
    fields['Email Status'] = 'Unsubscribed';
    fields['Status'] = STATUS.DNC;
    fields['Approved'] = false;
    fields['Next Attempt At'] = '';
    action = 'Unsubscribed and marked Do Not Call';
  } else if (intent === 'not_interested') {
    fields['Email Status'] = 'Replied: not interested';
    if (lead['Status'] !== STATUS.DNC) fields['Status'] = STATUS.NOT_INTERESTED;
    fields['Next Attempt At'] = '';
    action = 'Marked Not Interested';
  } else if (intent === 'out_of_office') {
    action = 'Out of office, ignored';
  } else {
    fields['Email Status'] = 'Replied: ' + intent.replace('_', ' ');
    if (intent === 'interested' || intent === 'meeting_request') fields['Status'] = STATUS.INTERESTED;
    if (score > (Number(lead['Interest Score']) || 0)) fields['Interest Score'] = score;
    if (r.shouldReply && String(r.replyBody || '').trim()) {
      var replyText = String(r.replyBody).trim();
      if (intent === 'meeting_request' || intent === 'interested') replyText = ensureBookingLink_(replyText);
      replyText += emailFooter_();
      var auto = settingBool_('AUTO_SEND_REPLIES') && !r.needsHuman;
      var res = draftOrSend_(message.createDraftReply(replyText, { htmlBody: textToHtml_(replyText) }), auto);
      action = (res.sent ? 'Reply sent' : 'Reply draft saved') + (r.needsHuman ? ' (needs you)' : '');
    }
  }
  thread.addLabel(gmailLabel_());
  updateRow_(table, lead, fields);

  appendRecord_(SHEETS.EMAILS, EMAIL_HEADERS, {
    'Processed At': now, 'Message ID': message.getId(), 'Thread ID': thread.getId(), 'Lead ID': lead['Lead ID'],
    'Direction': 'In', 'From': message.getFrom(), 'To': message.getTo(), 'Subject': message.getSubject(),
    'Intent': intent, 'Action': action, 'Summary': r.summary, 'Body Preview': truncate_(body, 500)
  });

  if (intent === 'interested' || intent === 'meeting_request' || r.needsHuman || score >= settingNum_('HOT_SCORE', 70)) {
    notifyHotLead_(lead, {
      source: 'Email reply', score: score, summary: r.summary, nextStep: action,
      email: extractEmail_(message.getFrom()), link: 'https://mail.google.com/mail/u/0/#all/' + thread.getId(),
      meeting: intent === 'meeting_request'
    });
  }
}

// ===== Notify =====

/**
 * AI Caller: hot-lead alerts and the daily digest.
 */

function notifyEmail_() {
  return setting_('NOTIFY_EMAIL') || Session.getEffectiveUser().getEmail();
}

function sheetLink_() {
  return ss_().getUrl();
}

/** info: { source, score, summary, nextStep, callback, email, recording, link, meeting } */
function notifyHotLead_(lead, info) {
  var title = (info.meeting ? '📅 Meeting: ' : '🔥 Hot lead: ') + lead['Business Name'] + ' (' + info.score + '/100)';
  var rows = [
    ['Source', info.source],
    ['Business', lead['Business Name']],
    ['Contact', lead['Contact Name']],
    ['Phone', lead['Phone']],
    ['Email', info.email || lead['Email']],
    ['Location', [lead['Suburb'], lead['State']].filter(String).join(', ')],
    ['Summary', info.summary],
    ['Next step', info.nextStep],
    ['Callback / meeting', info.callback],
    ['Recording', info.recording],
    ['Email thread', info.link]
  ].filter(function (r) { return String(r[1] || '').trim(); });

  var text = title + '\n\n' + rows.map(function (r) { return r[0] + ': ' + r[1]; }).join('\n') + '\n\nLeads sheet: ' + sheetLink_();
  var html = '<h2 style="font-family:sans-serif">' + escapeHtml_(title) + '</h2><table style="font-family:sans-serif;border-collapse:collapse">' +
    rows.map(function (r) {
      var v = /^https?:\/\//.test(String(r[1])) ? '<a href="' + escapeHtml_(r[1]) + '">Open</a>' : escapeHtml_(r[1]);
      return '<tr><td style="padding:4px 12px 4px 0;color:#555;vertical-align:top"><b>' + escapeHtml_(r[0]) + '</b></td><td style="padding:4px 0">' + v + '</td></tr>';
    }).join('') + '</table><p style="font-family:sans-serif"><a href="' + sheetLink_() + '">Open the Leads sheet</a></p>';

  GmailApp.sendEmail(notifyEmail_(), title, text, { htmlBody: html, name: 'AI Caller' });
  postToChat_(text);
}

/** Slack and Google Chat incoming webhooks both accept {"text": "..."}. */
function postToChat_(text) {
  var url = setting_('CHAT_WEBHOOK_URL');
  if (!url) return;
  try {
    UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify({ text: text }), muteHttpExceptions: true });
  } catch (e) { logError_('postToChat', e); }
}

/** Daily trigger (5pm Sydney time): a summary of today's calls and emails. */
function sendDailyDigest() {
  var today = fmt_(new Date(), HOME_TZ, 'yyyy-MM-dd');
  var isToday = function (d) { return d instanceof Date && fmt_(d, HOME_TZ, 'yyyy-MM-dd') === today; };

  var calls = readTable_(SHEETS.CALLS).rows.filter(function (r) { return isToday(r['Received At']); });
  var emails = readTable_(SHEETS.EMAILS).rows.filter(function (r) { return isToday(r['Processed At']) && r['Direction'] === 'In'; });
  var leads = readTable_(SHEETS.LEADS).rows;

  var byOutcome = {};
  var minutes = 0, cost = 0;
  calls.forEach(function (c) {
    byOutcome[c['Outcome'] || 'unknown'] = (byOutcome[c['Outcome'] || 'unknown'] || 0) + 1;
    minutes += (Number(c['Duration (s)']) || 0) / 60;
    cost += Number(c['Cost (USD)']) || 0;
  });

  var hot = leads.filter(function (l) { return l['Status'] === STATUS.INTERESTED && isToday(l['Updated At']); });
  var callbacks = leads.filter(function (l) { return l['Status'] === STATUS.CALLBACK; });
  var review = leads.filter(function (l) { return l['Status'] === STATUS.REVIEW; });
  var waiting = leads.filter(function (l) { return toBool_(l['Approved']) && callableStatuses_().indexOf(String(l['Status'] || '')) >= 0; });

  var lines = [
    'AI Caller: daily summary for ' + today,
    '',
    'Calls today: ' + calls.length + ' (' + minutes.toFixed(1) + ' min, about US$' + cost.toFixed(2) + ')',
    Object.keys(byOutcome).map(function (k) { return '  - ' + k + ': ' + byOutcome[k]; }).join('\n'),
    'Emails from leads today: ' + emails.length,
    'Approved leads still to call: ' + waiting.length,
    ''
  ];
  if (hot.length) {
    lines.push('Interested today:');
    hot.forEach(function (l) { lines.push('  - ' + l['Business Name'] + ' (' + l['Interest Score'] + '/100): ' + truncate_(l['Summary'], 200)); });
    lines.push('');
  }
  if (callbacks.length) {
    lines.push('Callbacks booked:');
    callbacks.forEach(function (l) { lines.push('  - ' + l['Business Name'] + ': ' + (l['Callback Time'] || 'time not set')); });
    lines.push('');
  }
  if (review.length) {
    lines.push('Calls that need you to listen (automatic scoring failed):');
    review.forEach(function (l) { lines.push('  - ' + l['Business Name']); });
    lines.push('');
  }
  lines.push('Leads sheet: ' + sheetLink_());

  var text = lines.join('\n');
  GmailApp.sendEmail(notifyEmail_(), 'AI Caller daily summary: ' + calls.length + ' calls, ' + hot.length + ' interested', text,
    { htmlBody: '<div style="font-family:sans-serif">' + textToHtml_(text).replace(/  /g, '&nbsp;&nbsp;') + '</div>', name: 'AI Caller' });
}

// ===== Setup =====

/**
 * AI Caller: the menu, one-time setup and the on/off switch.
 */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('AI Caller')
    .addItem('1. Set up sheets', 'setupSheets')
    .addItem('2. Enter API keys', 'enterApiKeys')
    .addItem('3. Choose Vapi phone number', 'chooseVapiPhoneNumber')
    .addItem('4. Save web app URL', 'saveWebAppUrl')
    .addItem('5. Create/update Vapi assistant', 'createOrUpdateAssistant')
    .addSeparator()
    .addItem('Check setup', 'checkSetup')
    .addItem('Test Gemini with a sample call', 'testGemini')
    .addItem('Call the selected lead now', 'callSelectedLead')
    .addItem('Check inbox now', 'processInboxNow')
    .addItem('Send daily summary now', 'sendDailyDigest')
    .addSeparator()
    .addItem('▶ Start automation', 'startAutomation')
    .addItem('⏸ Stop automation', 'stopAutomation')
    .addToUi();
}

function ensureSheet_(name, headers) {
  var ss = ss_();
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (headers) {
    var existing = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String) : [];
    var missing = headers.filter(function (h) { return existing.indexOf(h) < 0; });
    if (!existing.filter(String).length) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    } else if (missing.length) {
      sh.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]);
    }
    sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold').setBackground('#e8eaed');
    sh.setFrozenRows(1);
  }
  return sh;
}

/** Menu 1: creates the tabs, settings, Drive folder and webhook secret. Safe to run again. */
function setupSheets() {
  var ss = ss_();
  ss.setSpreadsheetTimeZone(HOME_TZ);
  setSecret_(SECRET_KEYS.SPREADSHEET_ID, ss.getId());

  var leads = ensureSheet_(SHEETS.LEADS, LEAD_HEADERS);
  ensureSheet_(SHEETS.CALLS, CALL_HEADERS);
  ensureSheet_(SHEETS.EMAILS, EMAIL_HEADERS);
  ensureSheet_(SHEETS.LOG, LOG_HEADERS);

  // Settings: add any keys that are missing, never overwrite yours.
  var settings = ensureSheet_(SHEETS.SETTINGS, ['Setting', 'Value', 'What it does']);
  var have = settings.getLastRow() > 1
    ? settings.getRange(2, 1, settings.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0]); })
    : [];
  var add = DEFAULT_SETTINGS.filter(function (r) { return have.indexOf(r[0]) < 0; });
  if (add.length) settings.getRange(settings.getLastRow() + 1, 1, add.length, 3).setValues(add);
  settings.getRange(2, 2, Math.max(settings.getLastRow() - 1, 1), 1).setNumberFormat('@');
  settings.setColumnWidth(1, 190);
  settings.setColumnWidth(2, 320);
  settings.setColumnWidth(3, 560);
  _settingsCache = null;

  // Example row first: checkbox cells count as filled rows afterwards.
  if (leads.getLastRow() < 2) {
    var example = {};
    example['Lead ID'] = newLeadId_();
    example['Approved'] = false;
    example['Business Name'] = 'TEST - My own phone';
    example['Contact Name'] = 'Me';
    example['Phone'] = ''; // left blank on purpose: a made-up number could belong to a real person
    example['Email'] = Session.getEffectiveUser().getEmail();
    example['Suburb'] = 'Parramatta';
    example['State'] = 'NSW';
    example['Category'] = 'Plumber';
    example['Has GBP'] = 'No';
    example['Notes'] = 'TEST: put your own mobile number in Phone, tick Approved, then use "Call the selected lead now".';
    example['Status'] = STATUS.NEW;
    leads.getRange(2, 1, 1, LEAD_HEADERS.length).setValues([LEAD_HEADERS.map(function (h) { return example[h] === undefined ? '' : example[h]; })]);
  }

  // Leads tab helpers: checkboxes, dropdowns, colours.
  var colIn = readTable_(SHEETS.LEADS).col;
  var maxRows = leads.getMaxRows() - 1;
  leads.getRange(2, colIn['Approved'], maxRows, 1).insertCheckboxes();
  leads.getRange(2, colIn['Has GBP'], maxRows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['Yes', 'No', ''], true).setAllowInvalid(true).build());
  leads.getRange(2, colIn['State'], maxRows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(Object.keys(STATE_TZ), true).setAllowInvalid(true).build());
  leads.getRange(2, colIn['Phone'], maxRows, 1).setNumberFormat('@');
  ['Last Call At', 'Next Attempt At', 'Last Email At', 'Updated At'].forEach(function (h) {
    leads.getRange(2, colIn[h], maxRows, 1).setNumberFormat('ddd d mmm yyyy h:mm am/pm');
  });

  var statusLetter = columnLetter_(colIn['Status']);
  var whole = leads.getRange(2, 1, maxRows, leads.getLastColumn());
  var colour = function (status, bg) {
    return SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$' + statusLetter + '2="' + status + '"').setBackground(bg).setRanges([whole]).build();
  };
  leads.setConditionalFormatRules([
    colour(STATUS.INTERESTED, '#d9ead3'),
    colour(STATUS.CALLBACK, '#fff2cc'),
    colour(STATUS.REVIEW, '#fce5cd'),
    colour(STATUS.CALLING, '#cfe2f3'),
    colour(STATUS.DNC, '#efefef'),
    colour(STATUS.NOT_INTERESTED, '#efefef'),
    colour(STATUS.WRONG_NUMBER, '#efefef'),
    colour(STATUS.BAD_PHONE, '#efefef')
  ]);

  buildDashboard_();

  if (!getSecret_(SECRET_KEYS.WEBHOOK_TOKEN)) {
    setSecret_(SECRET_KEYS.WEBHOOK_TOKEN, Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8));
  }
  var folderId = getSecret_(SECRET_KEYS.DRIVE_FOLDER_ID);
  var folderOk = false;
  if (folderId) { try { DriveApp.getFolderById(folderId).getName(); folderOk = true; } catch (e) { folderOk = false; } }
  if (!folderOk) setSecret_(SECRET_KEYS.DRIVE_FOLDER_ID, DriveApp.createFolder('AI Caller - Call Recordings').getId());

  SpreadsheetApp.getUi().alert('Sheets are ready.\n\nNext: check the Settings tab (your business name, phone, signature, address), then "2. Enter API keys".');
}

function buildDashboard_() {
  var sh = ensureSheet_(SHEETS.DASHBOARD);
  sh.clear();
  var L = function (h) { return columnLetter_(LEAD_HEADERS.indexOf(h) + 1); };
  var C = function (h) { return columnLetter_(CALL_HEADERS.indexOf(h) + 1); };
  var status = 'Leads!' + L('Status') + '2:' + L('Status');
  var rows = [
    ['AI Caller dashboard', ''],
    ['', ''],
    ['Leads', '=COUNTA(Leads!' + L('Business Name') + '2:' + L('Business Name') + ')'],
    ['Approved to call', '=COUNTIF(Leads!' + L('Approved') + '2:' + L('Approved') + ',TRUE)'],
    ['Calls today', '=COUNTIFS(Calls!' + C('Received At') + '2:' + C('Received At') + ',">="&TODAY())'],
    ['Calls in total', '=COUNTA(Calls!' + C('Call ID') + '2:' + C('Call ID') + ')'],
    ['Minutes in total', '=ROUND(SUM(Calls!' + C('Duration (s)') + '2:' + C('Duration (s)') + ')/60,1)'],
    ['Call cost in total (USD)', '=ROUND(SUM(Calls!' + C('Cost (USD)') + '2:' + C('Cost (USD)') + '),2)'],
    ['', ''],
    ['By status', '']
  ];
  Object.keys(STATUS).forEach(function (k) {
    rows.push([STATUS[k], '=COUNTIF(' + status + ',"' + STATUS[k] + '")']);
  });
  sh.getRange(1, 1, rows.length, 2).setValues(rows);
  sh.getRange('A1').setFontSize(16).setFontWeight('bold');
  sh.getRange('A10').setFontWeight('bold');
  sh.setColumnWidth(1, 220);
}

function promptValue_(title, question, current) {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt(title, question + (current ? '\n\n(Already set. Leave blank to keep it.)' : ''), ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return null;
  return res.getResponseText().trim();
}

/** Menu 2: API keys go into Script Properties, not the sheet. */
function enterApiKeys() {
  var v = promptValue_('Vapi private API key', 'Vapi dashboard > Organization (or API Keys) > Private key.', getSecret_(SECRET_KEYS.VAPI_API_KEY));
  if (v === null) return;
  if (v) setSecret_(SECRET_KEYS.VAPI_API_KEY, v);
  var g = promptValue_('Google Gemini API key', 'Free key from https://aistudio.google.com/apikey', getSecret_(SECRET_KEYS.GEMINI_API_KEY));
  if (g === null) return;
  if (g) setSecret_(SECRET_KEYS.GEMINI_API_KEY, g);
  SpreadsheetApp.getUi().alert('Saved. Next: "3. Choose Vapi phone number".');
}

/** Menu 3. */
function chooseVapiPhoneNumber() {
  var ui = SpreadsheetApp.getUi();
  var numbers;
  try { numbers = listVapiPhoneNumbers_(); } catch (e) { ui.alert('Could not list Vapi phone numbers:\n\n' + e.message); return; }
  if (!numbers.length) {
    ui.alert('Your Vapi account has no phone numbers yet. Add one in the Vapi dashboard (Phone Numbers), then run this again.');
    return;
  }
  if (numbers.length === 1) {
    setSecret_(SECRET_KEYS.VAPI_PHONE_NUMBER_ID, numbers[0].id);
    ui.alert('Using ' + numbers[0].number + ' (' + numbers[0].provider + ').\n\nNext: deploy the web app, then "4. Save web app URL".');
    return;
  }
  var list = numbers.map(function (n, i) { return (i + 1) + '. ' + n.number + ' ' + n.provider + ' ' + n.name; }).join('\n');
  var pick = promptValue_('Choose a phone number', list + '\n\nType the number of the one to call from (e.g. 1):', getSecret_(SECRET_KEYS.VAPI_PHONE_NUMBER_ID));
  if (!pick) return;
  var chosen = numbers[Number(pick) - 1];
  if (!chosen) { ui.alert('That is not one of the options.'); return; }
  setSecret_(SECRET_KEYS.VAPI_PHONE_NUMBER_ID, chosen.id);
  ui.alert('Using ' + chosen.number + '.\n\nNext: deploy the web app, then "4. Save web app URL".');
}

/** Menu 4. */
function saveWebAppUrl() {
  var suggested = '';
  try { suggested = ScriptApp.getService().getUrl() || ''; } catch (e) { suggested = ''; }
  var v = promptValue_('Web app URL',
    'Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone). Copy the "Web app" URL ending in /exec and paste it here.' +
      (suggested ? '\n\nDetected: ' + suggested : ''),
    getSecret_(SECRET_KEYS.WEBAPP_URL));
  if (v === null) return;
  if (!v && suggested && !getSecret_(SECRET_KEYS.WEBAPP_URL)) v = suggested;
  if (v) {
    if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(v)) {
      SpreadsheetApp.getUi().alert('That should look like https://script.google.com/macros/s/.../exec. Try again.');
      return;
    }
    setSecret_(SECRET_KEYS.WEBAPP_URL, v);
  }
  SpreadsheetApp.getUi().alert('Saved. Next: "5. Create/update Vapi assistant".');
}

/** Menu 5. Run again whenever you change the Settings tab. */
function createOrUpdateAssistant() {
  var ui = SpreadsheetApp.getUi();
  try {
    ui.alert(syncVapiAssistant_() + '\n\nNext: put your own number in the TEST row, tick Approved, click the row and use "Call the selected lead now".');
  } catch (e) {
    logError_('createOrUpdateAssistant', e);
    ui.alert('Vapi said no:\n\n' + e.message);
  }
}

function testGemini() {
  var sample = [
    'AI: Hi, this is Alex, an AI assistant calling from Webtouch. Just so you know, this call is recorded. Have I got Smith Plumbing?',
    'User: Yeah, Dave speaking.',
    'AI: Thanks Dave. When we searched for plumbers around Parramatta, your business didn\'t come up on Google Maps. Is getting more customers from Google something you\'re working on?',
    'User: Ah, yeah, we\'ve been meaning to sort that out actually. I\'m flat out today though.',
    'AI: No worries. Could we book a free 15-minute check with one of our consultants? What day suits?',
    'User: Thursday arvo is good. Send it to dave at smith plumbing dot com dot au.',
    'AI: That\'s d-a-v-e at smithplumbing dot com dot au, Thursday afternoon. Perfect, thanks Dave!'
  ].join('\n');
  try {
    var a = analyseCall_(sample, { 'Business Name': 'Smith Plumbing', 'State': 'NSW' }, new Date());
    SpreadsheetApp.getUi().alert('Gemini works. It read the sample call as:\n\n' + JSON.stringify(a, null, 2));
  } catch (e) {
    SpreadsheetApp.getUi().alert('Gemini failed:\n\n' + e.message);
  }
}

function processInboxNow() {
  if (!Number(getSecret_(SECRET_KEYS.INBOX_SINCE))) {
    setSecret_(SECRET_KEYS.INBOX_SINCE, String(Date.now() - 24 * 3600000));
  }
  processInbox();
  SpreadsheetApp.getUi().alert('Inbox checked. See the Emails tab and your Gmail drafts.');
}

var TRIGGER_HANDLERS = ['callNextLeads', 'processInbox', 'sendDailyDigest'];

function removeTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (TRIGGER_HANDLERS.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
}

function startAutomation() {
  var problems = setupProblems_();
  var ui = SpreadsheetApp.getUi();
  if (problems.length) { ui.alert('Finish setup first:\n\n- ' + problems.join('\n- ')); return; }
  removeTriggers_();
  ScriptApp.newTrigger('callNextLeads').timeBased().everyMinutes(10).create();
  ScriptApp.newTrigger('processInbox').timeBased().everyMinutes(15).create();
  ScriptApp.newTrigger('sendDailyDigest').timeBased().atHour(17).everyDays(1).inTimezone(HOME_TZ).create();
  if (!Number(getSecret_(SECRET_KEYS.INBOX_SINCE))) setSecret_(SECRET_KEYS.INBOX_SINCE, String(Date.now()));
  ui.alert('Automation is ON.\n\nEvery 10 minutes it calls approved leads (only during calling hours); every 15 minutes it checks your inbox. ' +
    'You get a summary at 5pm Sydney time.\n\nOnly leads with Approved ticked are ever called.');
}

function stopAutomation() {
  removeTriggers_();
  SpreadsheetApp.getUi().alert('Automation is OFF. No calls will be made and the inbox is not checked.');
}

function setupProblems_() {
  var p = [];
  if (!ss_().getSheetByName(SHEETS.SETTINGS)) p.push('Run "1. Set up sheets"');
  if (!getSecret_(SECRET_KEYS.VAPI_API_KEY)) p.push('Vapi API key missing ("2. Enter API keys")');
  if (!getSecret_(SECRET_KEYS.GEMINI_API_KEY)) p.push('Gemini API key missing ("2. Enter API keys")');
  if (!getSecret_(SECRET_KEYS.VAPI_PHONE_NUMBER_ID)) p.push('No phone number chosen ("3. Choose Vapi phone number")');
  if (!getSecret_(SECRET_KEYS.WEBAPP_URL)) p.push('Web app URL missing ("4. Save web app URL")');
  if (!getSecret_(SECRET_KEYS.VAPI_ASSISTANT_ID)) p.push('Vapi assistant not created ("5. Create/update Vapi assistant")');
  return p;
}

function checkSetup() {
  var lines = [];
  var problems = setupProblems_();
  lines.push(problems.length ? '❌ ' + problems.join('\n❌ ') : '✅ All keys and IDs are set');
  if (getSecret_(SECRET_KEYS.VAPI_API_KEY) && getSecret_(SECRET_KEYS.VAPI_ASSISTANT_ID)) {
    try {
      var a = vapi_('get', '/assistant/' + getSecret_(SECRET_KEYS.VAPI_ASSISTANT_ID));
      var url = dig_(a, 'server.url') || a.serverUrl || '';
      lines.push(url && url.indexOf(getSecret_(SECRET_KEYS.WEBAPP_URL)) === 0
        ? '✅ Vapi assistant "' + a.name + '" sends results to this sheet'
        : '❌ Vapi assistant is not pointing at this sheet. Run "5. Create/update Vapi assistant"');
    } catch (e) { lines.push('❌ Vapi: ' + truncate_(e.message, 200)); }
  }
  if (getSecret_(SECRET_KEYS.WEBAPP_URL)) {
    try {
      var res = UrlFetchApp.fetch(getSecret_(SECRET_KEYS.WEBAPP_URL), { muteHttpExceptions: true, followRedirects: true });
      lines.push(res.getContentText().indexOf('AI Caller is running') >= 0
        ? '✅ Web app is reachable'
        : '❌ Web app did not answer. Check it is deployed with access "Anyone"');
    } catch (e) { lines.push('❌ Web app: ' + truncate_(e.message, 200)); }
  }
  var on = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'callNextLeads'; });
  lines.push(on ? '✅ Automation is ON' : 'ℹ️ Automation is OFF (use "▶ Start automation" when ready)');
  lines.push('ℹ️ Calls placed today: ' + callsPlacedToday_() + ' of ' + settingNum_('DAILY_CALL_LIMIT', 30));
  SpreadsheetApp.getUi().alert('AI Caller setup check', lines.join('\n\n'), SpreadsheetApp.getUi().ButtonSet.OK);
}
