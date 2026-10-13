// Run with: node tests/run.js
'use strict';
const assert = require('assert');
const { makeEnv } = require('./fakes');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// Tuesday 13 Oct 2026, 10:00 in Sydney (AEDT, UTC+11).
const TUE_10AM_SYD = '2026-10-12T23:00:00Z';

function geminiReply(obj) {
  return { code: 200, body: { candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] } };
}

const INTERESTED = {
  outcome: 'interested', interestScore: 85, summary: 'Dave wants a free check on Thursday.',
  decisionMakerReached: true, contactName: 'Dave (owner)', email: 'dave@smithplumbing.com.au', emailConsent: true,
  meetingAgreed: true, callbackAt: '2026-10-15 14:00', callbackNote: 'Thursday arvo', servicesOfInterest: ['Local SEO'],
  objections: '', nextStep: 'Send invite for Thursday 2pm.'
};

// ---------- pure helpers ----------

test('phone numbers become +61', () => {
  const { ctx } = makeEnv();
  const n = ctx.normaliseAuPhone_;
  assert.strictEqual(n('0412 345 678'), '+61412345678');
  assert.strictEqual(n('412345678'), '+61412345678');           // Sheets ate the leading 0
  assert.strictEqual(n(412345678), '+61412345678');
  assert.strictEqual(n('(02) 9876 5432'), '+61298765432');
  assert.strictEqual(n('+61 412 345 678'), '+61412345678');
  assert.strictEqual(n('+61 0412 345 678'), '+61412345678');
  assert.strictEqual(n('61412345678'), '+61412345678');
  assert.strictEqual(n('+92 300 1234567'), '+923001234567');    // own phone overseas, for testing
  assert.strictEqual(n('1300 123 456'), '');
  assert.strictEqual(n('13 12 34'), '');
  assert.strictEqual(n(''), '');
  assert.strictEqual(n('n/a'), '');
});

test('calling hours follow the lead\'s state and the legal limits', () => {
  const { ctx } = makeEnv();
  const D = ctx.Date;
  const cfg = { days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], start: '09:30', end: '16:30', blocked: ['2026-12-25'] };
  const ok = (iso, tz, c = cfg) => ctx.isWithinCallWindow_(new D(iso), tz, c);
  assert.strictEqual(ok(TUE_10AM_SYD, 'Australia/Sydney'), true);
  assert.strictEqual(ok(TUE_10AM_SYD, 'Australia/Perth'), false);          // 7am in Perth
  assert.strictEqual(ok('2026-10-13T03:00:00Z', 'Australia/Perth'), true);  // 11am Perth
  assert.strictEqual(ok('2026-10-11T00:00:00Z', 'Australia/Sydney'), false); // Sunday
  assert.strictEqual(ok('2026-12-24T23:00:00Z', 'Australia/Sydney'), false); // Christmas
  const all = { days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], start: '00:00', end: '23:59', blocked: [] };
  assert.strictEqual(ok('2026-10-11T00:00:00Z', 'Australia/Sydney', all), false); // Sunday, even if allowed in settings
  assert.strictEqual(ok('2026-10-13T10:00:00Z', 'Australia/Sydney', all), false); // 9pm: after legal 8pm
  assert.strictEqual(ok('2026-10-10T06:30:00Z', 'Australia/Sydney', all), false); // Sat 5:30pm
  assert.strictEqual(ok('2026-10-09T23:00:00Z', 'Australia/Sydney', all), true);  // Sat 10am
});

test('local callback time converts across daylight saving and states', () => {
  const { ctx } = makeEnv();
  assert.strictEqual(ctx.localToDate_('2026-10-15 14:00', 'Australia/Sydney').toISOString(), '2026-10-15T03:00:00.000Z');
  assert.strictEqual(ctx.localToDate_('2026-07-01 10:00', 'Australia/Sydney').toISOString(), '2026-07-01T00:00:00.000Z');
  assert.strictEqual(ctx.localToDate_('2026-10-15 14:00', 'Australia/Brisbane').toISOString(), '2026-10-15T04:00:00.000Z');
  assert.strictEqual(ctx.localToDate_('2026-10-15 14:00', 'Australia/Adelaide').toISOString(), '2026-10-15T03:30:00.000Z');
  assert.strictEqual(ctx.localToDate_('Thursday', 'Australia/Sydney'), null);
});

test('state names and time zones', () => {
  const { ctx } = makeEnv();
  assert.strictEqual(ctx.tzForState_('Western Australia'), 'Australia/Perth');
  assert.strictEqual(ctx.tzForState_('qld'), 'Australia/Brisbane');
  assert.strictEqual(ctx.tzForState_('', 'SA'), 'Australia/Adelaide');
  assert.strictEqual(ctx.tzForState_('', ''), 'Australia/Sydney');
});

test('ended reasons are sorted into the right buckets', () => {
  const { ctx } = makeEnv();
  const b = ctx.bucketEndedReason_;
  assert.strictEqual(b('customer-did-not-answer', ''), 'no_answer');
  assert.strictEqual(b('customer-busy', ''), 'no_answer');
  assert.strictEqual(b('voicemail', 'AI: Hi'), 'voicemail');
  assert.strictEqual(b('twilio-failed-to-connect-call', ''), 'failed');
  assert.strictEqual(b('customer-ended-call', 'AI: Hi\nUser: who is this?'), 'conversation');
  assert.strictEqual(b('silence-timed-out', 'AI: Hi there'), 'no_answer');
});

test('which leads get called', () => {
  const { ctx } = makeEnv();
  const D = ctx.Date;
  const now = new D(TUE_10AM_SYD);
  const cfg = { days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], start: '09:30', end: '16:30', blocked: [], defaultState: 'NSW', maxAttempts: 3, autoCallbacks: true };
  const base = { 'Business Name': 'A', 'Phone': '0412345678', 'Approved': true, 'Status': 'New', 'State': 'NSW', 'Attempts': 0 };
  const why = l => ctx.leadSkipReason_(Object.assign({}, base, l), now, cfg);
  assert.strictEqual(why({}), '');
  assert.strictEqual(why({ Approved: false }), 'not approved');
  assert.strictEqual(why({ Status: 'Do Not Call' }), 'status Do Not Call');
  assert.strictEqual(why({ Status: 'Interested' }), 'status Interested');
  assert.strictEqual(why({ Attempts: 3, Status: 'Retry' }), 'max attempts');
  assert.strictEqual(why({ Status: 'Retry', 'Next Attempt At': new D('2026-10-14T00:00:00Z') }), 'not due yet');
  assert.strictEqual(why({ Status: 'Callback', 'Next Attempt At': new D('2026-10-12T00:00:00Z'), Attempts: 5 }), '');
  assert.strictEqual(why({ Phone: '1300 000 000' }), 'bad phone');
  assert.strictEqual(why({ State: 'WA' }), 'outside calling hours');
});

test('lead updates for each call result', () => {
  const { ctx } = makeEnv({ now: TUE_10AM_SYD });
  const D = ctx.Date;
  const now = new D();
  const cfg = { maxAttempts: 3, retryHours: 26, tz: 'Australia/Sydney' };
  const up = (lead, bucket, a) => ctx.leadUpdateForCall_(lead, bucket, a || {}, now, cfg);

  let f = up({ Attempts: 0 }, 'no_answer');
  assert.strictEqual(f.Status, 'Retry');
  assert.strictEqual(f.Attempts, 1);
  assert.strictEqual(f['Next Attempt At'].getTime(), now.getTime() + 26 * 3600000);

  f = up({ Attempts: 2 }, 'voicemail');
  assert.strictEqual(f.Status, 'No Answer');

  f = up({ Attempts: 2, 'Contact Name': '' }, 'conversation', INTERESTED);
  assert.strictEqual(f.Status, 'Interested');
  assert.strictEqual(f.Outcome, 'Meeting agreed');
  assert.strictEqual(f.Attempts, 0);
  assert.strictEqual(f.Email, 'dave@smithplumbing.com.au');
  assert.strictEqual(f['Contact Name'], 'Dave (owner)');

  f = up({}, 'conversation', Object.assign({}, INTERESTED, { outcome: 'callback' }));
  assert.strictEqual(f.Status, 'Callback');
  assert.strictEqual(f['Next Attempt At'].toISOString(), '2026-10-15T03:00:00.000Z');

  f = up({}, 'conversation', Object.assign({}, INTERESTED, { outcome: 'do_not_call' }));
  assert.strictEqual(f.Status, 'Do Not Call');
  assert.strictEqual(f.Approved, false);

  f = up({ Attempts: 0 }, 'conversation', Object.assign({}, INTERESTED, { outcome: 'gatekeeper', callbackAt: '' }));
  assert.strictEqual(f.Status, 'Retry');
  assert.strictEqual(f.Attempts, 1);

  f = up({}, 'conversation', { needsReview: true, summary: 's', outcome: 'no_conversation' });
  assert.strictEqual(f.Status, 'Needs Review');
});

test('agent prompt and lead brief are filled in', () => {
  const env = makeEnv();
  env.setup({ AGENCY_NAME: 'Webtouch', CONSULTANT_NAME: 'Sam', BOOKING_LINK: 'https://cal.example/sam' });
  const p = env.ctx.buildAgentPrompt_();
  assert.ok(p.includes('Webtouch'));
  assert.ok(p.includes('{{leadBrief}}'));
  assert.ok(p.includes('Sam'));
  assert.ok(!/undefined|null/.test(p));
  const first = env.ctx.buildFirstMessage_();
  assert.ok(first.includes('AI assistant') && first.includes('recorded') && first.includes('{{businessName}}'));
  const brief = env.ctx.buildLeadBrief_({ 'Business Name': 'Smith Plumbing', Category: 'Plumber', Suburb: 'Parramatta', State: 'NSW', 'Has GBP': 'No', Website: '', Notes: 'TEST' });
  assert.ok(brief.includes('none found when we searched'));
  assert.ok(brief.includes('Website: none found'));
  assert.ok(!brief.includes('TEST'));
});

test('email helpers', () => {
  const { ctx } = makeEnv();
  assert.strictEqual(ctx.extractEmail_('Dave Smith <Dave@SmithPlumbing.com.au>'), 'dave@smithplumbing.com.au');
  const body = 'Yes keen!\n\nOn Tue, 13 Oct 2026 at 10:00, Alex <me@agency.com.au> wrote:\n> Hi Dave';
  assert.strictEqual(ctx.stripQuotedReply_(body), 'Yes keen!');
});

// ---------- end to end ----------

function vapiAndGemini(env, geminiObj, extra) {
  env.onFetch((url, o) => {
    if (url.startsWith('https://generativelanguage.googleapis.com')) return geminiReply(typeof geminiObj === 'function' ? geminiObj(url, o) : geminiObj);
    if (url === 'https://api.vapi.ai/call') return { code: 201, body: { id: 'call_' + env.fetches.length, status: 'queued' } };
    if (url.startsWith('https://storage.vapi.ai/')) return { code: 200, body: 'RIFF...' };
    if (extra) return extra(url, o);
    return { code: 404, body: 'not found' };
  });
}

test('auto-caller places calls for approved leads only, within limits', () => {
  const env = makeEnv({ now: TUE_10AM_SYD });
  env.setup({ CALLS_PER_RUN: '2' });
  env.addLead({ 'Lead ID': 'L-1', 'Business Name': 'Not approved', Phone: '0412000001', Approved: false, Status: 'New', State: 'NSW' });
  env.addLead({ 'Lead ID': 'L-2', 'Business Name': 'Smith Plumbing', Phone: '412000002', Approved: true, Status: 'New', State: 'NSW', 'Has GBP': 'No' });
  env.addLead({ 'Lead ID': 'L-3', 'Business Name': 'Perth Sparky', Phone: '0412000003', Approved: true, Status: 'New', State: 'WA' });
  env.addLead({ 'Business Name': 'Third', Phone: '0412000004', Approved: true, State: 'VIC' });
  env.addLead({ 'Lead ID': 'L-5', 'Business Name': 'Fourth', Phone: '0412000005', Approved: true, Status: 'New', State: 'QLD' });
  vapiAndGemini(env, {});
  env.ctx.callNextLeads();

  const calls = env.fetches.filter(f => f.url === 'https://api.vapi.ai/call');
  assert.strictEqual(calls.length, 2);
  const first = JSON.parse(calls[0].o.payload);
  assert.strictEqual(first.customer.number, '+61412000002');
  assert.strictEqual(first.assistantId, 'as');
  assert.strictEqual(first.phoneNumberId, 'pn');
  assert.strictEqual(first.assistantOverrides.variableValues.businessName, 'Smith Plumbing');
  assert.ok(first.assistantOverrides.variableValues.leadBrief.includes('none found'));
  assert.strictEqual(calls[0].o.headers.Authorization, 'Bearer vk');

  const leads = env.leads();
  assert.strictEqual(leads[0].Status, 'New');            // not approved
  assert.strictEqual(leads[1].Status, 'Calling');
  assert.ok(leads[1]['Last Call ID']);
  assert.strictEqual(leads[2].Status, 'New');            // 7am in Perth
  assert.strictEqual(leads[3].Status, 'Calling');        // got a Lead ID and Status on the way
  assert.ok(/^L-/.test(leads[3]['Lead ID']));
  assert.strictEqual(leads[4].Status, 'New');            // per-run limit reached
});

test('end-of-call webhook: scores, saves recording, updates lead, alerts and drafts follow-up', () => {
  const env = makeEnv({ now: TUE_10AM_SYD });
  env.setup({ BOOKING_LINK: 'https://cal.example/sam', NOTIFY_EMAIL: 'boss@agency.com.au' });
  env.addLead({ 'Lead ID': 'L-2', 'Business Name': 'Smith Plumbing', Phone: '0412000002', Approved: true, Status: 'Calling', State: 'NSW', 'Last Call ID': 'call_abc', Attempts: 1 });
  let geminiCalls = 0;
  vapiAndGemini(env, (url, o) => {
    geminiCalls++;
    const prompt = JSON.parse(o.payload).contents[0].parts[0].text;
    if (prompt.includes('follow-up email')) return { subject: 'Your free Google check', body: 'Hi Dave,\n\nThanks for the chat today.' };
    assert.ok(prompt.includes('Tuesday 2026-10-13'), 'call date given to Gemini in local time');
    assert.strictEqual(o.headers['x-goog-api-key'], 'gk');
    return INTERESTED;
  });

  const report = {
    message: {
      type: 'end-of-call-report', endedReason: 'customer-ended-call', cost: 0.21,
      startedAt: '2026-10-12T23:00:00Z', endedAt: '2026-10-12T23:02:30Z',
      call: { id: 'call_abc', customer: { number: '+61412000002' } },
      artifact: { transcript: 'AI: Hi\nUser: Yeah, Dave here.', recordingUrl: 'https://storage.vapi.ai/abc.wav' }
    }
  };
  const bad = env.ctx.doPost({ parameter: { token: 'wrong' }, postData: { contents: JSON.stringify(report) } });
  assert.ok(bad.text.includes('unauthorised'));
  assert.strictEqual(env.calls().length, 0);

  const res = env.ctx.doPost({ parameter: { token: 'secret-token' }, postData: { contents: JSON.stringify(report) } });
  assert.ok(res.text.includes('"ok":true'), res.text);

  const lead = env.leads()[0];
  assert.strictEqual(lead.Status, 'Interested');
  assert.strictEqual(lead['Interest Score'], 85);
  assert.strictEqual(lead.Email, 'dave@smithplumbing.com.au');
  assert.ok(lead.Recording.startsWith('https://drive.google.com/'));
  assert.strictEqual(lead['Email Status'], 'Follow-up draft ready');

  const call = env.calls()[0];
  assert.strictEqual(call['Call ID'], 'call_abc');
  assert.strictEqual(call['Duration (s)'], 150);
  assert.strictEqual(call.Outcome, 'interested');
  assert.strictEqual(env.files.length, 2); // recording + transcript

  assert.strictEqual(env.sent.length, 1);
  assert.strictEqual(env.sent[0].to, 'boss@agency.com.au');
  assert.ok(env.sent[0].subject.includes('Smith Plumbing'));

  assert.strictEqual(env.drafts.length, 1);
  assert.strictEqual(env.drafts[0].to, 'dave@smithplumbing.com.au');
  assert.strictEqual(env.drafts[0].sent, false);
  assert.ok(env.drafts[0].body.includes('https://cal.example/sam'), 'booking link added');
  assert.ok(env.drafts[0].body.includes('unsubscribe'), 'unsubscribe line added');
  assert.strictEqual(env.emails()[0].Action, 'Draft saved');

  // Same webhook again (e.g. a retry) must not double up.
  env.ctx.doPost({ parameter: { token: 'secret-token' }, postData: { contents: JSON.stringify(report) } });
  assert.strictEqual(env.calls().length, 1);
  assert.strictEqual(geminiCalls, 2);
});

test('end-of-call webhook: do-not-call request stops all future calls, no email', () => {
  const env = makeEnv({ now: TUE_10AM_SYD });
  env.setup();
  env.addLead({ 'Lead ID': 'L-9', 'Business Name': 'Grumpy Co', Phone: '0412000009', Email: 'x@grumpy.com.au', Approved: true, Status: 'Calling', State: 'NSW', 'Last Call ID': 'call_dnc' });
  vapiAndGemini(env, Object.assign({}, INTERESTED, { outcome: 'do_not_call', interestScore: 0, emailConsent: false, email: '' }));
  env.ctx.doPost({ parameter: { token: 'secret-token' }, postData: { contents: JSON.stringify({ message: {
    type: 'end-of-call-report', endedReason: 'customer-ended-call', call: { id: 'call_dnc' },
    artifact: { transcript: 'AI: Hi\nUser: Take me off your list.' } } }) } });
  const lead = env.leads()[0];
  assert.strictEqual(lead.Status, 'Do Not Call');
  assert.strictEqual(lead.Approved, false);
  assert.strictEqual(env.sent.length, 0);
  assert.strictEqual(env.drafts.length, 0);
});

test('end-of-call webhook: Gemini down -> Needs Review, never redialled', () => {
  const env = makeEnv({ now: TUE_10AM_SYD });
  env.setup();
  env.addLead({ 'Lead ID': 'L-7', 'Business Name': 'Cafe', Phone: '0412000007', Approved: true, Status: 'Calling', State: 'NSW', 'Last Call ID': 'call_x' });
  env.onFetch(url => url.startsWith('https://generativelanguage') ? { code: 400, body: { error: 'bad key' } } : { code: 404, body: '' });
  env.ctx.doPost({ parameter: { token: 'secret-token' }, postData: { contents: JSON.stringify({ message: {
    type: 'end-of-call-report', endedReason: 'customer-ended-call', call: { id: 'call_x' },
    analysis: { summary: 'Vapi summary.' }, artifact: { transcript: 'AI: Hi\nUser: Hello?' } } }) } });
  const lead = env.leads()[0];
  assert.strictEqual(lead.Status, 'Needs Review');
  assert.ok(lead.Summary.includes('Vapi summary.'));
  assert.ok(env.log().some(r => r.Level === 'ERROR'));
});

test('end-of-call webhook: no answer schedules a retry', () => {
  const env = makeEnv({ now: TUE_10AM_SYD });
  env.setup();
  env.addLead({ 'Lead ID': 'L-8', 'Business Name': 'Bakery', Phone: '0412000008', Approved: true, Status: 'Calling', State: 'NSW', 'Last Call ID': 'call_na', Attempts: 0 });
  vapiAndGemini(env, {});
  env.ctx.doPost({ parameter: { token: 'secret-token' }, postData: { contents: JSON.stringify({ message: {
    type: 'end-of-call-report', endedReason: 'customer-did-not-answer', call: { id: 'call_na' } } }) } });
  const lead = env.leads()[0];
  assert.strictEqual(lead.Status, 'Retry');
  assert.strictEqual(lead.Attempts, 1);
  assert.strictEqual(env.fetches.filter(f => f.url.includes('generativelanguage')).length, 0, 'no AI cost for unanswered calls');
});

test('stuck "Calling" lead is recovered from the Vapi API', () => {
  const env = makeEnv({ now: TUE_10AM_SYD });
  env.setup({ CALL_DAYS: 'Sat' }); // no new calls today, only the recovery runs
  const D = env.ctx.Date;
  env.addLead({ 'Lead ID': 'L-6', 'Business Name': 'Florist', Phone: '0412000006', Approved: true, Status: 'Calling', State: 'NSW',
    'Last Call ID': 'call_lost', 'Last Call At': new D(new D().getTime() - 30 * 60000) });
  vapiAndGemini(env, {}, url => url.endsWith('/call/call_lost')
    ? { code: 200, body: { id: 'call_lost', status: 'ended', endedReason: 'customer-busy' } } : { code: 404, body: '' });
  env.ctx.callNextLeads();
  assert.strictEqual(env.leads()[0].Status, 'Retry');
  assert.strictEqual(env.calls()[0]['Call ID'], 'call_lost');
});

function fakeMessage(id, from, body, date, D) {
  return {
    getId: () => id, getFrom: () => from, getTo: () => 'me@agency.com.au', getSubject: () => 'Re: Your free Google check',
    getPlainBody: () => body, getDate: () => date,
    createDraftReply: (text) => ({ __reply: text })
  };
}

test('inbox: lead replies keen -> reply drafted, lead marked Interested, alert sent', () => {
  const D = Date;
  let created = null;
  const msgs = [];
  const thread = { getId: () => 'thread-1', getMessages: () => msgs, getLabels: () => [], addLabel() {} };
  const env = makeEnv({ now: TUE_10AM_SYD, threads: [thread] });
  env.setup({ BOOKING_LINK: 'https://cal.example/sam' });
  env.props.INBOX_SINCE = String(new env.ctx.Date('2026-10-12T00:00:00Z').getTime());
  env.addLead({ 'Lead ID': 'L-2', 'Business Name': 'Smith Plumbing', Phone: '0412000002', Email: 'dave@smithplumbing.com.au', Status: 'Callback', State: 'NSW' });

  const old = fakeMessage('m-0', 'Dave <dave@smithplumbing.com.au>', 'old', new env.ctx.Date('2026-10-01T00:00:00Z'));
  const mine = fakeMessage('m-1', 'Me <me@agency.com.au>', 'Hi Dave', new env.ctx.Date('2026-10-12T22:00:00Z'));
  const reply = fakeMessage('m-2', 'Dave <dave@smithplumbing.com.au>', 'Sounds good, can we do Thursday?\n\nOn Tue wrote:\n> Hi Dave', new env.ctx.Date('2026-10-12T22:30:00Z'));
  reply.createDraftReply = (text) => { created = env.makeDraft('dave', 'Re', text, 'thread-1'); return created; };
  msgs.push(old, mine, reply);

  vapiAndGemini(env, { intent: 'meeting_request', interestScore: 90, summary: 'Wants Thursday.', shouldReply: true, needsHuman: false, replyBody: 'Great, Dave! Pick a time here.' });
  env.ctx.processInbox();

  assert.ok(created, 'reply draft created');
  assert.strictEqual(created.sent, false);
  assert.ok(created.body.includes('https://cal.example/sam'));
  const lead = env.leads()[0];
  assert.strictEqual(lead.Status, 'Interested');
  assert.strictEqual(lead['Interest Score'], 90);
  const rows = env.emails();
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0]['Message ID'], 'm-2');
  assert.strictEqual(rows[0].Intent, 'meeting_request');
  assert.strictEqual(env.sent.length, 1, 'hot-lead alert');

  // Next run: nothing new to do.
  env.ctx.processInbox();
  assert.strictEqual(env.emails().length, 1);
});

test('inbox: unsubscribe marks Do Not Call and sends nothing', () => {
  const msgs = [];
  const thread = { getId: () => 'thread-2', getMessages: () => msgs, getLabels: () => [], addLabel() {} };
  const env = makeEnv({ now: TUE_10AM_SYD, threads: [thread] });
  env.setup();
  env.props.INBOX_SINCE = '1';
  env.addLead({ 'Lead ID': 'L-3', 'Business Name': 'Cafe', Email: 'owner@cafe.com.au', Approved: true, Status: 'Retry' });
  // Reply comes from a colleague at the same business domain.
  const m = fakeMessage('m-9', 'Jo <jo@cafe.com.au>', 'Please remove us from your list.', new env.ctx.Date('2026-10-12T22:30:00Z'));
  m.createDraftReply = () => { throw new Error('should not reply'); };
  msgs.push(m);
  vapiAndGemini(env, { intent: 'unsubscribe', interestScore: 0, summary: 'Remove.', shouldReply: false, needsHuman: false, replyBody: '' });
  env.ctx.processInbox();
  const lead = env.leads()[0];
  assert.strictEqual(lead.Status, 'Do Not Call');
  assert.strictEqual(lead.Approved, false);
  assert.strictEqual(lead['Email Status'], 'Unsubscribed');
  assert.strictEqual(env.sent.length, 0);
});

test('Vapi assistant config drops fields Vapi rejects and retries', () => {
  const env = makeEnv();
  env.setup();
  delete env.props.VAPI_ASSISTANT_ID;
  const bodies = [];
  env.onFetch((url, o) => {
    if (url === 'https://api.vapi.ai/assistant') {
      const b = JSON.parse(o.payload);
      bodies.push(b);
      if (b.voicemailDetection) return { code: 400, body: { message: ['voicemailDetection.provider must be one of ...'], statusCode: 400 } };
      return { code: 201, body: { id: 'asst_new' } };
    }
    return { code: 404, body: '' };
  });
  const msg = env.ctx.syncVapiAssistant_();
  assert.strictEqual(env.props.VAPI_ASSISTANT_ID, 'asst_new');
  assert.ok(msg.includes('voicemailDetection'));
  const last = bodies[bodies.length - 1];
  assert.strictEqual(last.server.url, 'https://script.google.com/macros/s/X/exec?token=secret-token');
  assert.deepStrictEqual(last.serverMessages, ['end-of-call-report']);
  assert.strictEqual(last.transcriber.language, 'en-AU');
  assert.ok(last.model.messages[0].content.includes('Never claim to be human'));
});

// ---------- run ----------
let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log('  ok   ' + t.name); }
  catch (e) { failed++; console.log('  FAIL ' + t.name + '\n       ' + (e.stack || e).split('\n').slice(0, 4).join('\n       ')); }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
