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
