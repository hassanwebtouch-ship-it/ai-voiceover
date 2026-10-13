// In-memory stand-ins for the Google Apps Script services the code uses,
// so the whole flow can be tested with plain Node.
'use strict';
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function formatDate(date, tz, pattern) {
  const parts = {};
  new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
    minute: '2-digit', second: '2-digit', weekday: 'long', hourCycle: 'h23'
  }).formatToParts(date).forEach(p => { parts[p.type] = p.value; });
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  const offMin = Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
  const sign = offMin < 0 ? '-' : '+';
  const abs = Math.abs(offMin);
  const Z = sign + String(Math.floor(abs / 60)).padStart(2, '0') + String(abs % 60).padStart(2, '0');
  return pattern
    .replace(/yyyy|MM|dd|HH|mm|ss|EEEE|EEE|Z/g, t => ({
      yyyy: parts.year, MM: parts.month, dd: parts.day, HH: parts.hour, mm: parts.minute, ss: parts.second,
      EEEE: parts.weekday, EEE: parts.weekday.slice(0, 3), Z
    }[t]));
}

class FakeRange {
  constructor(sheet, r, c, nr, nc) { Object.assign(this, { sheet, r, c, nr: nr || 1, nc: nc || 1 }); }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = [];
      for (let j = 0; j < this.nc; j++) {
        const v = (this.sheet.data[this.r - 1 + i] || [])[this.c - 1 + j];
        row.push(v === undefined ? '' : v);
      }
      out.push(row);
    }
    return out;
  }
  setValues(vals) { vals.forEach((row, i) => row.forEach((v, j) => this.sheet.set(this.r + i, this.c + j, v))); return this; }
  setValue(v) { this.sheet.set(this.r, this.c, v); return this; }
  getRow() { return this.r; }
}
['setFontWeight', 'setBackground', 'setNumberFormat', 'insertCheckboxes', 'setDataValidation', 'setFontSize']
  .forEach(m => { FakeRange.prototype[m] = function () { return this; }; });

class FakeSheet {
  constructor(name) { this.name = name; this.data = []; }
  getName() { return this.name; }
  set(r, c, v) { while (this.data.length < r) this.data.push([]); this.data[r - 1][c - 1] = v; }
  getLastRow() {
    for (let i = this.data.length - 1; i >= 0; i--) if ((this.data[i] || []).some(v => v !== '' && v !== undefined)) return i + 1;
    return 0;
  }
  getLastColumn() { return this.data.reduce((m, r) => Math.max(m, r.length), 0); }
  getMaxRows() { return 1000; }
  getRange(r, c, nr, nc) { return new FakeRange(this, r, c, nr, nc); }
  appendRow(vals) { const r = this.getLastRow() + 1; vals.forEach((v, j) => this.set(r, j + 1, v)); }
  setFrozenRows() {} setColumnWidth() {} setConditionalFormatRules() {} clear() { this.data = []; }
  // test helper: rows as objects
  records() {
    const [h, ...rows] = this.data;
    return rows.map(r => Object.fromEntries(h.map((k, i) => [k, r[i] === undefined ? '' : r[i]])));
  }
}

function makeEnv(opts = {}) {
  const sheets = {};
  const props = {};
  const cache = {};
  const sent = [];       // emails sent with GmailApp.sendEmail
  const drafts = [];     // drafts created
  const files = [];      // Drive files
  const fetches = [];    // UrlFetchApp calls
  const triggers = [];
  let fetchHandler = () => ({ code: 404, body: '' });

  const ss = {
    getSheetByName: n => sheets[n] || null,
    insertSheet: n => (sheets[n] = new FakeSheet(n)),
    getId: () => 'ss-1', getUrl: () => 'https://docs.google.com/spreadsheets/d/ss-1',
    setSpreadsheetTimeZone() {}
  };

  const fixedNow = opts.now ? new Date(opts.now).getTime() : null;
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length === 0 && fixedNow !== null) super(fixedNow); else super(...a); }
    static now() { return fixedNow !== null ? fixedNow : RealDate.now(); }
  }

  const label = { name: 'AI Caller', getName: () => 'AI Caller' };
  function makeDraft(to, subject, body, threadId) {
    const id = 'msg-out-' + (drafts.length + 1);
    const thread = { getId: () => threadId || 'thread-out-' + (drafts.length + 1), addLabel() {} };
    const d = { to, subject, body, sent: false, getMessage: () => ({ getId: () => id, getThread: () => thread }),
      send() { d.sent = true; return { getId: () => id }; } };
    drafts.push(d);
    return d;
  }

  const ctx = {
    console: { log() {}, error() {}, warn() {} },
    Date: FakeDate, JSON, Math, Object, Array, String, Number, RegExp, Error, encodeURIComponent, isNaN, parseInt,
    Utilities: {
      formatDate, getUuid: () => crypto.randomUUID(), sleep() {}
    },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); }
    }) },
    CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock() {}, releaseLock() {} }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss },
    UrlFetchApp: { fetch: (url, o = {}) => {
      fetches.push({ url, o });
      const r = fetchHandler(url, o);
      const body = typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
      return { getResponseCode: () => r.code || 200, getContentText: () => body,
        getBlob: () => ({ setName(n) { this.name = n; return this; } }) };
    } },
    DriveApp: {
      getFolderById: () => ({ getName: () => 'f', createFile: (a, b) => {
        const name = typeof a === 'string' ? a : a.name;
        files.push({ name, content: b });
        return { getUrl: () => 'https://drive.google.com/file/' + files.length };
      } }),
      createFolder: () => ({ getId: () => 'folder-1' })
    },
    MimeType: { PLAIN_TEXT: 'text/plain' },
    GmailApp: {
      sendEmail: (to, subject, body, o) => sent.push({ to, subject, body, o }),
      createDraft: (to, subject, body) => makeDraft(to, subject, body),
      getUserLabelByName: () => label, createLabel: () => label,
      getAliases: () => [],
      search: () => (opts.threads || [])
    },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'me@agency.com.au' }) },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: t => ({ text: t, setMimeType() { return this; } })
    },
    ScriptApp: { getProjectTriggers: () => triggers }
  };
  vm.createContext(ctx);
  const src = path.join(__dirname, '..', 'src');
  // Reverse order on purpose: Apps Script doesn't promise a load order, so no file may
  // use another file's values at load time.
  fs.readdirSync(src).filter(f => f.endsWith('.js')).sort().reverse().forEach(f => {
    vm.runInContext(fs.readFileSync(path.join(src, f), 'utf8'), ctx, { filename: f });
  });

  return {
    ctx, sheets, props, sent, drafts, files, fetches, makeDraft,
    onFetch(fn) { fetchHandler = fn; },
    // Creates the tabs the way setupSheets does, without the UI parts.
    setup(settings = {}) {
      ctx.ensureSheet_(ctx.SHEETS.LEADS, ctx.LEAD_HEADERS);
      ctx.ensureSheet_(ctx.SHEETS.CALLS, ctx.CALL_HEADERS);
      ctx.ensureSheet_(ctx.SHEETS.EMAILS, ctx.EMAIL_HEADERS);
      ctx.ensureSheet_(ctx.SHEETS.LOG, ctx.LOG_HEADERS);
      const s = ctx.ensureSheet_(ctx.SHEETS.SETTINGS, ['Setting', 'Value', 'What it does']);
      ctx.DEFAULT_SETTINGS.forEach((r, i) => s.getRange(i + 2, 1, 1, 3).setValues([[r[0], r[0] in settings ? settings[r[0]] : r[1], r[2]]]));
      Object.assign(props, {
        VAPI_API_KEY: 'vk', GEMINI_API_KEY: 'gk', VAPI_PHONE_NUMBER_ID: 'pn', VAPI_ASSISTANT_ID: 'as',
        WEBHOOK_TOKEN: 'secret-token', WEBAPP_URL: 'https://script.google.com/macros/s/X/exec', DRIVE_FOLDER_ID: 'folder-1'
      });
    },
    addLead(fields) {
      const sh = sheets[ctx.SHEETS.LEADS];
      sh.appendRow(ctx.LEAD_HEADERS.map(h => (h in fields ? fields[h] : '')));
    },
    leads() { return sheets[ctx.SHEETS.LEADS].records(); },
    calls() { return sheets[ctx.SHEETS.CALLS].records(); },
    emails() { return sheets[ctx.SHEETS.EMAILS].records(); },
    log() { return sheets[ctx.SHEETS.LOG].records(); }
  };
}

module.exports = { makeEnv, formatDate };
