#!/usr/bin/env node
'use strict';
/* Test for the wake-word matcher (renderer/voice.js): npm run test-wakeword.
   Verifies that speech-to-text variations of "Hey Blade" reliably wake the assistant,
   extract the trailing command, and ignore non-wake phrases. */
const fs = require('fs');
const path = require('path');

let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };

// Extract clean() and the wake regex from renderer/voice.js to guarantee testing production code
const voiceCode = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'voice.js'), 'utf8');

// Match the regex: /^(hey |hi |ok |okay )?(blade deck|bladedeck|blades?|blaid|blayed)\b\s*(.*)$/
const reMatch = voiceCode.match(/cleaned\.match\((\/\^.*?\/)\)/);
if (!reMatch) {
  console.error('FAIL: Could not locate wake-word regex in renderer/voice.js');
  process.exit(1);
}
const WAKE_RE = new RegExp(reMatch[1].slice(1, -1));

const digits = (t) => t.replace(/\bzero\b/g, '0').replace(/\bone\b/g, '1').replace(/\btwo\b/g, '2').replace(/\bthree\b/g, '3').replace(/\bfour\b/g, '4').replace(/\bfive\b/g, '5').replace(/\bsix\b/g, '6').replace(/\bseven\b/g, '7').replace(/\beight\b/g, '8').replace(/\bnine\b/g, '9').replace(/\bten\b/g, '10').replace(/\beleven\b/g, '11').replace(/\btwelve\b/g, '12');
const clean = (t) => digits(String(t).toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9: ]+/g, ' ').replace(/\s+/g, ' ').trim());

function checkWake(text) {
  const cleaned = clean(text);
  const m = cleaned.match(WAKE_RE);
  if (!m) return null;
  return { wakes: true, trigger: m[2], rest: (m[3] || '').trim() };
}

// 1. Positive tests: phrases that MUST wake
const positives = [
  { text: 'Hey Blade', expectedRest: '' },
  { text: 'hey blade', expectedRest: '' },
  { text: 'Hi Blade', expectedRest: '' },
  { text: 'hi blade', expectedRest: '' },
  { text: 'Ok Blade', expectedRest: '' },
  { text: 'okay blade', expectedRest: '' },
  { text: 'Blade', expectedRest: '' },
  { text: 'Blades', expectedRest: '' },
  { text: 'Bladedeck', expectedRest: '' },
  { text: 'Blade deck', expectedRest: '' },
  { text: 'Blaid', expectedRest: '' },
  { text: 'Blayed', expectedRest: '' },
  { text: 'Hey Blades', expectedRest: '' },
  { text: 'Hi Bladedeck', expectedRest: '' },
  { text: 'Hey Blade what time is it', expectedRest: 'what time is it' },
  { text: 'Hi Bladedeck, open settings', expectedRest: 'open settings' },
  { text: 'Blade deck next song', expectedRest: 'next song' },
  { text: 'Okay Blade pause', expectedRest: 'pause' },
  { text: 'Blaid what\'s the weather', expectedRest: 'whats the weather' },
  { text: 'Blayed mute', expectedRest: 'mute' },
  { text: 'Hey Blade volume up', expectedRest: 'volume up' }
];

for (const p of positives) {
  const res = checkWake(p.text);
  ok(!!res && res.wakes, `"${p.text}" wakes the assistant`);
  if (res) {
    ok(res.rest === p.expectedRest, `"${p.text}" extracts rest: "${res.rest}" (expected "${p.expectedRest}")`);
  }
}

// 2. Negative tests: phrases that MUST NOT wake
const negatives = [
  'Hello there',
  'Play Hades',
  'Hey Siri',
  'Hey Google',
  'Alexa',
  'Bladerunner',
  'Bleed',
  'Braid',
  'Good morning',
  'Random background noise',
  'Yesterday',
  'The game is fun',
  'bladey',
  'blader',
  'oblade'
];

for (const phrase of negatives) {
  const res = checkWake(phrase);
  ok(res === null, `"${phrase}" does not wake the assistant`);
}

console.log(`\nWake-word test finished with ${fails} failure(s).`);
process.exit(fails > 0 ? 1 : 0);
