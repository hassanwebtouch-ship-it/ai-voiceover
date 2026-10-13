/**
 * AI Caller: Google Gemini (free tier) for scoring calls and writing emails.
 * Get a key at https://aistudio.google.com/apikey
 */

function geminiJson_(prompt, schema, system) {
  var model = setting_('GEMINI_MODEL') || 'gemini-2.5-flash';
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
  var body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseSchema: schema }
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  var data = httpJson_('post', url, body, { 'x-goog-api-key': requireSecret_(SECRET_KEYS.GEMINI_API_KEY) });
  var parts = dig_(data, 'candidates.0.content.parts') || [];
  var text = parts.filter(function (p) { return p.text && !p.thought; }).map(function (p) { return p.text; }).join('');
  if (!text) throw new Error('Gemini returned no text: ' + truncate_(JSON.stringify(data), 500));
  return JSON.parse(text);
}
