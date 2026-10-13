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
