const { test } = require('node:test');
const assert = require('node:assert/strict');
const { travelLinks, createTravelLinkFlow } = require('../.logic-tests/travel-links-controller.js');

test('only explicit confirmation opens a fixed HTTPS website, with no trip, auth or tracking query', async () => {
  const opened = []; const flow = createTravelLinkFlow(async url => opened.push(url));
  assert.equal((await flow.confirm()).ok, false);
  assert.equal(flow.select('stays'), true); assert.equal(opened.length, 0);
  flow.cancel(); assert.equal((await flow.confirm()).ok, false);
  for (const link of travelLinks) {
    assert.equal(flow.select(link.id), true);
    assert.equal((await flow.confirm()).ok, true);
    const url = new URL(opened.at(-1));
    assert.equal(url.protocol, 'https:'); assert.equal(url.hostname, link.domain);
    assert.equal(url.search + url.hash + url.username + url.password, '');
    assert.equal((await flow.confirm()).ok, false);
  }
});
test('untrusted destinations cannot replace the allowlist', async () => {
  let calls = 0; const flow = createTravelLinkFlow(async () => { calls++; });
  for (const id of ['https://evil.example', 'javascript:alert(1)', '__proto__', '']) {
    assert.equal(flow.select(id), false); assert.equal((await flow.confirm()).ok, false);
  }
  assert.equal(calls, 0);
});
test('concurrent confirmation opens once and blocks destination changes until settled', async () => {
  let finish; let calls = 0;
  const flow = createTravelLinkFlow(() => { calls++; return new Promise(resolve => { finish = resolve; }); });
  flow.select('flights'); const first = flow.confirm();
  assert.equal((await flow.confirm()).ok, false); assert.equal(flow.select('stays'), false);
  finish(); assert.equal((await first).ok, true); assert.equal(calls, 1);
});
test('external-open failure is recoverable, redacted and never claims a reservation succeeded', async () => {
  const flow = createTravelLinkFlow(async () => { throw new Error('private-browser-context'); });
  flow.select('stays'); const result = await flow.confirm();
  assert.equal(result.ok, false); assert.doesNotMatch(result.message, /private-browser-context|thành công/);
  assert.equal(flow.select('stays'), true);
});
