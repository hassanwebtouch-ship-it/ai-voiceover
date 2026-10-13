/**
 * AI Caller: what the voice agent says, and the per-lead brief it gets.
 *
 * Agency details are baked into the assistant when you run
 * "Create/update Vapi assistant". Lead details are passed on every call as
 * {{businessName}} and {{leadBrief}}.
 */

function agencyInfo_() {
  var consultant = setting_('CONSULTANT_NAME');
  return {
    agency: setting_('AGENCY_NAME') || 'our agency',
    website: setting_('AGENCY_WEBSITE'),
    phone: setting_('AGENCY_PHONE'),
    agent: setting_('AGENT_NAME') || 'Alex',
    consultant: consultant || 'one of our consultants',
    consultantShort: consultant || 'the consultant',
    offer: setting_('OFFER') || 'a free 15-minute Google visibility check',
    services: settingList_('SERVICES'),
    pricing: setting_('PRICING_NOTE'),
    bookingLink: setting_('BOOKING_LINK')
  };
}

function buildFirstMessage_() {
  var a = agencyInfo_();
  return 'Hi, this is ' + a.agent + ', an AI assistant calling from ' + a.agency +
    ' — just so you know, this call is recorded. Have I got {{businessName}}?';
}

function buildVoicemailMessage_() {
  var a = agencyInfo_();
  return 'Hi, this is ' + a.agent + ', an AI assistant from ' + a.agency +
    '. I was calling about helping your business get more customers from Google. ' +
    'No need to call back, we\'ll try again another time' +
    (a.website ? ', or you can find us at ' + a.website : '') + '. Thanks, bye!';
}

function buildAgentPrompt_() {
  var a = agencyInfo_();
  var contact = [a.agency, a.website, a.phone].filter(String).join(', ');
  var priceLine = a.pricing
    ? 'If they ask about price: "' + a.pricing + '. ' + a.consultantShort + ' can give an exact quote after the free check."'
    : 'If they ask about price: it depends on the business and the area, which is exactly what the free check works out. ' +
      a.consultantShort + ' gives an exact quote after it. Never make up a number.';

  return [
    '# Role',
    'You are ' + a.agent + ', an AI phone assistant making short outbound calls for ' + a.agency +
      ', an Australian digital marketing agency' + (a.website ? ' (' + a.website + ')' : '') +
      '. You call local Australian businesses.',
    '',
    '# Who you are calling',
    '{{leadBrief}}',
    '',
    '# Goal, in order',
    '1. Reach the owner or whoever looks after marketing.',
    '2. Find out whether getting more customers from Google is a priority for them right now.',
    '3. If there is interest, book ' + a.offer + ' with ' + a.consultant +
      ': agree a day and rough time, and get the best email for the invite.',
    '4. If they would rather read something first, get their email and their OK to send a short summary.',
    'A booked check or permission to email is a win. Do not try to sell a package on this call.',
    '',
    '# What ' + a.agency + ' does',
    a.services.map(function (s) { return '- ' + s; }).join('\n'),
    '',
    '# How to talk',
    '- Friendly, relaxed and polite, like a helpful Australian receptionist. Plain English, no marketing jargon.',
    '- One or two short sentences per turn, then stop and listen. Ask one question at a time.',
    '- If they start talking, stop and listen. Never talk over them.',
    '- Use their name once you know it, but don\'t overdo it.',
    '- Keep the call under three minutes unless they are keen to keep chatting.',
    '- Say email addresses and times back to confirm them. Spell emails letter by letter.',
    '',
    '# Opening',
    'Your first line has already said you are an AI assistant from ' + a.agency + ' and that the call is recorded.',
    'Once they confirm the business, give ONE short reason for calling, based only on the lead details above:',
    '- No Google Business Profile found: "The reason I\'m calling: when we searched for [their type of business] around [their suburb], your business didn\'t come up on Google Maps, and that\'s where most locals look now."',
    '- Profile found but few reviews or a low rating: "You\'re on Google Maps, but a few competitors with more reviews are showing above you."',
    '- No website found: "We couldn\'t find a website for the business, which makes it harder for people who find you on Google to get in touch."',
    '- Otherwise: "We help local businesses like yours get more calls from Google search and Maps."',
    'Then ask: "Is getting more customers from Google something you\'re working on at the moment?"',
    'Only mention facts from the lead details. If they say the details are wrong, apologise and accept it.',
    '',
    '# Situations',
    '- Receptionist or gatekeeper: be polite. Ask who looks after marketing and when is a good time to reach them, or for an email to send information to. Note any name and time.',
    '- Owner is busy: ask for a better day and time to call back, confirm it, and end politely.',
    '- "Just send me an email": great. Get the email, spell it back, and say you\'ll send a short summary' +
      (a.bookingLink ? ' with a link to book the free check' : '') + '.',
    '- Interested: offer ' + a.offer + '. Ask what day and rough time suits this week or next, get the best email for the invite, confirm both back, and say ' + a.consultantShort + ' will confirm by email.',
    '- ' + priceLine,
    '- Already has an agency, or does it themselves: respect that. Ask once if they would like a free second opinion on how they are showing on Google. If not, thank them and end.',
    '- Not interested: acknowledge it and ask at most ONE gentle question (e.g. "Totally fair. Is that because you\'re busy enough already?"). If it is still no, thank them and end. Never push twice.',
    '- "Take me off your list", "don\'t call again", or they are annoyed: apologise, confirm they won\'t be called again, say goodbye and end the call straight away. Don\'t try to change their mind.',
    '- "Where did you get my number?": from the business\'s public listing online, such as Google or a business directory.',
    '- They ask who is calling or for contact details: ' + contact + '.',
    '- "Are you a robot / AI?": always say yes, honestly. You are an AI assistant for ' + a.agency + '.',
    '- Wrong number, or not a business: apologise and end the call.',
    '- A question you can\'t answer: say ' + a.consultantShort + ' can cover it on the call or by email. Never guess.',
    '',
    '# Never',
    '- Never claim to be human.',
    '- Never promise rankings ("number one on Google"), a number of leads, or any guaranteed result.',
    '- Never invent facts about their business, our clients, prices or results.',
    '- Never ask for payment or card details.',
    '- Never criticise competitors or their current agency.',
    '',
    '# Ending',
    'Before hanging up, briefly confirm what was agreed (time, email, next step). Then say a short, friendly goodbye and use the endCall tool.',
    'After a "don\'t call me" request, say goodbye and end the call immediately.'
  ].join('\n');
}

/** The per-call brief shown to the agent as {{leadBrief}}. */
function buildLeadBrief_(lead) {
  var lines = [];
  lines.push('Business: ' + (lead['Business Name'] || 'unknown'));
  if (lead['Category']) lines.push('Type of business: ' + lead['Category']);
  var place = [lead['Suburb'], lead['State']].filter(function (x) { return String(x || '').trim(); }).join(', ');
  if (place) lines.push('Location: ' + place);
  if (lead['Contact Name']) lines.push('Contact name we have (may be out of date): ' + lead['Contact Name']);

  var gbp = yesNo_(lead['Has GBP']);
  if (gbp === 'No') {
    lines.push('Google Business Profile: none found when we searched.');
  } else if (gbp === 'Yes') {
    var bits = [];
    if (lead['GBP Rating'] !== '' && lead['GBP Rating'] !== undefined) bits.push('rating ' + lead['GBP Rating']);
    if (lead['GBP Reviews'] !== '' && lead['GBP Reviews'] !== undefined) bits.push(lead['GBP Reviews'] + ' reviews');
    lines.push('Google Business Profile: yes' + (bits.length ? ' (' + bits.join(', ') + ')' : '') + '.');
  } else {
    lines.push('Google Business Profile: not checked.');
  }

  var site = String(lead['Website'] || '').trim();
  lines.push('Website: ' + (site || 'none found'));

  var notes = String(lead['Notes'] || '').replace(/\bTEST\b/g, '').trim();
  if (notes) lines.push('Our research notes: ' + truncate_(notes, 500));

  if (lead['Summary']) {
    lines.push('');
    lines.push('We have spoken before. Last call: ' + truncate_(lead['Summary'], 600));
    if (lead['Next Step']) lines.push('Agreed next step: ' + lead['Next Step']);
    if (lead['Callback Time']) lines.push('They asked us to call back: ' + lead['Callback Time']);
    lines.push('Mention that you are calling back as agreed, and pick up from there.');
  }
  return lines.join('\n');
}
