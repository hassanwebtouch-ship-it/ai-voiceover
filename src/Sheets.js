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
