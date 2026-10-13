// Writes docs/agent-prompt.md: the exact script the voice agent gets, using the
// default Settings, so it can be reviewed without opening Vapi. Run: node tools/render-prompt.js
'use strict';
const fs = require('fs');
const path = require('path');
const { makeEnv } = require('../tests/fakes');
const env = makeEnv();
env.setup();
const c = env.ctx;
const example = c.buildLeadBrief_({
  'Business Name': 'Smith Plumbing', Category: 'Plumber', Suburb: 'Parramatta', State: 'NSW',
  'Has GBP': 'No', Website: '', Notes: 'Lots of 5-star competitors on Maps.'
});
const md = [
  '# Voice agent script',
  '',
  'Generated from `src/Prompt.js` with the default Settings by `node tools/render-prompt.js`.',
  'Change the Settings tab (agency name, offer, services, pricing) and run',
  '**AI Caller > 5. Create/update Vapi assistant** to update the live agent.',
  '',
  '## First line (spoken as soon as they pick up)',
  '',
  '> ' + c.buildFirstMessage_(),
  '',
  '## Voicemail message',
  '',
  '> ' + c.buildVoicemailMessage_(),
  '',
  '## Example `{{leadBrief}}` for one lead',
  '',
  '```',
  example,
  '```',
  '',
  '## System prompt',
  '',
  '```markdown',
  c.buildAgentPrompt_(),
  '```',
  ''
].join('\n');
fs.writeFileSync(path.join(__dirname, '..', 'docs', 'agent-prompt.md'), md);
console.log('docs/agent-prompt.md written');
