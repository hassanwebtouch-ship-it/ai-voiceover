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
