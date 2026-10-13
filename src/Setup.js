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
