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
