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
