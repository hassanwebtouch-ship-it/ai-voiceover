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
