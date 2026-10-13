/**
 * AI Caller: Vapi API (voice agent, phone numbers, calls).
 * Docs: https://docs.vapi.ai/api-reference
 */

var VAPI_BASE = 'https://api.vapi.ai';

/** Fields Vapi has renamed over time. Dropped and retried if the API rejects them. */
var VAPI_OPTIONAL_FIELDS = ['voicemailDetection', 'backgroundSound', 'artifactPlan', 'endCallMessage', 'silenceTimeoutSeconds'];

function vapi_(method, path, body) {
  return httpJson_(method, VAPI_BASE + path, body, {
    Authorization: 'Bearer ' + requireSecret_(SECRET_KEYS.VAPI_API_KEY)
  });
}

function webhookUrl_() {
  var base = requireSecret_(SECRET_KEYS.WEBAPP_URL);
  return base + (base.indexOf('?') >= 0 ? '&' : '?') + 'token=' +
    encodeURIComponent(requireSecret_(SECRET_KEYS.WEBHOOK_TOKEN));
}

function buildAssistantConfig_() {
  return {
    name: truncate_(setting_('AGENCY_NAME') + ' caller', 40),
    firstMessage: buildFirstMessage_(),
    model: {
      provider: setting_('VAPI_LLM_PROVIDER') || 'openai',
      model: setting_('VAPI_LLM_MODEL') || 'gpt-4o-mini',
      temperature: 0.4,
      messages: [{ role: 'system', content: buildAgentPrompt_() }],
      tools: [{ type: 'endCall' }]
    },
    voice: {
      provider: setting_('VAPI_VOICE_PROVIDER') || 'vapi',
      voiceId: setting_('VAPI_VOICE_ID') || 'Elliot'
    },
    transcriber: { provider: 'deepgram', model: 'nova-2', language: 'en-AU' },
    voicemailDetection: { provider: 'vapi' },
    voicemailMessage: buildVoicemailMessage_(),
    endCallMessage: 'Thanks for your time, have a great day!',
    backgroundSound: 'office',
    maxDurationSeconds: 360,
    silenceTimeoutSeconds: 20,
    artifactPlan: { recordingEnabled: true },
    server: { url: webhookUrl_() },
    serverMessages: ['end-of-call-report']
  };
}

/** Sends an assistant config, dropping optional fields Vapi says it doesn't accept. */
function saveAssistantConfig_(method, path, config) {
  var dropped = [];
  for (var i = 0; i <= VAPI_OPTIONAL_FIELDS.length; i++) {
    try {
      var res = vapi_(method, path, config);
      return { assistant: res, dropped: dropped };
    } catch (e) {
      if (e.status !== 400) throw e;
      var msg = JSON.stringify(e.body || e.message);
      var bad = VAPI_OPTIONAL_FIELDS.filter(function (f) { return config[f] !== undefined && msg.indexOf(f) >= 0; });
      if (!bad.length) throw e;
      bad.forEach(function (f) { delete config[f]; dropped.push(f); });
    }
  }
  throw new Error('Vapi kept rejecting the assistant config.');
}

/** Creates the assistant the first time, updates it after that. Returns a message for the user. */
function syncVapiAssistant_() {
  var config = buildAssistantConfig_();
  var id = getSecret_(SECRET_KEYS.VAPI_ASSISTANT_ID);
  var result;
  if (id) {
    try {
      result = saveAssistantConfig_('PATCH', '/assistant/' + id, config);
    } catch (e) {
      if (e.status !== 404) throw e;
      id = '';
    }
  }
  if (!id) {
    result = saveAssistantConfig_('POST', '/assistant', config);
    setSecret_(SECRET_KEYS.VAPI_ASSISTANT_ID, result.assistant.id);
  }
  var note = result.dropped.length ? ' (Vapi did not accept: ' + result.dropped.join(', ') + '. Not a problem.)' : '';
  log_('INFO', 'syncVapiAssistant', 'Assistant saved: ' + result.assistant.id + note);
  return 'Vapi assistant saved: ' + result.assistant.id + note;
}

function listVapiPhoneNumbers_() {
  var res = vapi_('get', '/phone-number');
  var list = Array.isArray(res) ? res : (res && res.results) || [];
  return list.map(function (p) {
    return { id: p.id, number: p.number || p.sipUri || '', provider: p.provider || '', name: p.name || '' };
  });
}

/** Starts an outbound call. Returns Vapi's call object (has .id). */
function startVapiCall_(lead, phone) {
  return vapi_('post', '/call', {
    assistantId: requireSecret_(SECRET_KEYS.VAPI_ASSISTANT_ID),
    phoneNumberId: requireSecret_(SECRET_KEYS.VAPI_PHONE_NUMBER_ID),
    customer: { number: phone, name: truncate_(lead['Business Name'] || 'Lead', 40) },
    assistantOverrides: {
      variableValues: {
        businessName: String(lead['Business Name'] || 'your business'),
        leadBrief: buildLeadBrief_(lead)
      }
    }
  });
}

function getVapiCall_(callId) {
  return vapi_('get', '/call/' + encodeURIComponent(callId));
}

/** Makes a finished call fetched from the API look like an end-of-call-report webhook. */
function callToReport_(call) {
  return {
    type: 'end-of-call-report',
    call: call,
    endedReason: call.endedReason,
    startedAt: call.startedAt,
    endedAt: call.endedAt,
    cost: call.cost,
    artifact: call.artifact || {},
    analysis: call.analysis || {},
    transcript: call.transcript,
    recordingUrl: call.recordingUrl
  };
}
